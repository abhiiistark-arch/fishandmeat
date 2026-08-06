"""Fish and Meat — application security controls.

In-memory rate limits / cooldowns (Mongo optional persistence via callbacks).
Designed to wrap Flask without changing business logic.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Callable, Optional

from flask import Flask, Request, Response, g, jsonify, request, session

# ---------------------------------------------------------------------------
# Tunables (env-overridable from app)
# ---------------------------------------------------------------------------

LOGIN_FAIL_LIMIT = 10
LOGIN_FAIL_WINDOW_SEC = 10 * 60
LOGIN_COOLDOWN_SEC = 15 * 60

# Progressive delay ladder (failures → forced wait before next attempt is answered)
# 5 → 2s | 10 → 5s | 20 → 30s | 50 → 5 minutes
PROGRESSIVE_DELAYS = (
    (50, 5 * 60),
    (20, 30),
    (10, 5),
    (5, 2),
)

API_RATE_LIMIT = 100
API_RATE_WINDOW_SEC = 60
API_COOLDOWN_SEC = 60

ACCOUNT_LOCK_FAILS = 50
ACCOUNT_LOCK_WINDOW_SEC = 30 * 60
ACCOUNT_LOCK_SEC = 5 * 60

BOT_MIN_UA_LEN = 12
CSRF_HEADER = 'X-CSRF-Token'
CSRF_COOKIE = 'fam_csrf'
CSRF_FORM_FIELD = 'csrf_token'
TOKEN_ISS = 'fishandmeat'
TOKEN_AUD = 'fam-mobile'

# Paths that skip global API rate cooldown (static/health)
_RATE_EXEMPT_PREFIXES = (
    '/static/',
    '/assets/',
    '/favicon',
    '/mobile/assets/',
)

_LOGIN_PATHS = {
    '/admin/login',
    '/api/auth/login',
    '/api/auth/signup',
    '/api/mobile/login',
}

_MUTATING = {'POST', 'PUT', 'PATCH', 'DELETE'}

_lock = threading.RLock()
_ip_hits: dict[str, deque] = defaultdict(deque)
_ip_cooldown_until: dict[str, float] = {}
_login_fails: dict[str, deque] = defaultdict(deque)
_login_cooldown_until: dict[str, float] = {}
_account_fails: dict[str, deque] = defaultdict(deque)
_account_lock_until: dict[str, float] = {}
_security_log: deque = deque(maxlen=2000)


def _now() -> float:
    return time.time()


def client_ip(req: Optional[Request] = None) -> str:
    req = req or request
    forwarded = (req.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
    if forwarded:
        return forwarded[:64]
    return (req.remote_addr or '0.0.0.0')[:64]


def browser_fingerprint(req: Optional[Request] = None) -> str:
    """Lightweight fingerprint from request headers (+ optional client header)."""
    req = req or request
    parts = [
        (req.headers.get('User-Agent') or '')[:200],
        (req.headers.get('Accept-Language') or '')[:80],
        (req.headers.get('Accept') or '')[:80],
        (req.headers.get('X-Fam-Fp') or '')[:64],
    ]
    raw = '|'.join(parts)
    return hashlib.sha256(raw.encode('utf-8', errors='ignore')).hexdigest()[:32]


def security_log(event: str, detail: str = '', **extra: Any) -> None:
    entry = {
        'at': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'event': event,
        'detail': (detail or '')[:300],
        'ip': client_ip(),
        'path': (request.path if request else '')[:160],
        'ua': ((request.headers.get('User-Agent') if request else '') or '')[:160],
        'fp': browser_fingerprint() if request else '',
        **{k: v for k, v in extra.items() if v is not None},
    }
    with _lock:
        _security_log.appendleft(entry)


def recent_security_events(limit: int = 100) -> list:
    with _lock:
        return list(_security_log)[:limit]


def _prune_deque(dq: deque, window: float, now: float) -> None:
    while dq and now - dq[0] > window:
        dq.popleft()


def is_ip_cooling(ip: str | None = None) -> tuple[bool, int]:
    ip = ip or client_ip()
    now = _now()
    with _lock:
        until = _ip_cooldown_until.get(ip) or _login_cooldown_until.get(ip) or 0
        if until > now:
            return True, int(until - now)
        _ip_cooldown_until.pop(ip, None)
        _login_cooldown_until.pop(ip, None)
    return False, 0


def set_ip_cooldown(seconds: int, ip: str | None = None, reason: str = '') -> None:
    ip = ip or client_ip()
    with _lock:
        _ip_cooldown_until[ip] = _now() + max(1, seconds)
    security_log('ip_cooldown', reason or f'{seconds}s', seconds=seconds)


def record_api_hit(ip: str | None = None) -> tuple[bool, str]:
    """Return (blocked, message). Temporary cooldown if > API_RATE_LIMIT / minute."""
    ip = ip or client_ip()
    now = _now()
    with _lock:
        until = _ip_cooldown_until.get(ip, 0)
        if until > now:
            return True, f'Too many requests. Try again in {int(until - now)}s.'
        dq = _ip_hits[ip]
        _prune_deque(dq, API_RATE_WINDOW_SEC, now)
        dq.append(now)
        if len(dq) > API_RATE_LIMIT:
            _ip_cooldown_until[ip] = now + API_COOLDOWN_SEC
            security_log('api_rate_limit', f'>{API_RATE_LIMIT}/min → {API_COOLDOWN_SEC}s cooldown')
            return True, f'Too many requests. Try again in {API_COOLDOWN_SEC}s.'
    return False, ''


def progressive_delay_seconds(fail_count: int) -> int:
    for threshold, delay in PROGRESSIVE_DELAYS:
        if fail_count >= threshold:
            return int(delay)
    return 0


def _fail_count(identity: str = '', ip: str | None = None) -> int:
    ip = ip or client_ip()
    identity = (identity or '').strip().lower()[:80]
    now = _now()
    with _lock:
        dq = _login_fails[ip]
        _prune_deque(dq, LOGIN_FAIL_WINDOW_SEC, now)
        count = len(dq)
        if identity:
            aq = _account_fails[identity]
            _prune_deque(aq, ACCOUNT_LOCK_WINDOW_SEC, now)
            count = max(count, len(aq))
        return count


def apply_progressive_delay(identity: str = '', ip: str | None = None) -> int:
    """Block the worker briefly based on failure ladder. Returns seconds slept."""
    delay = progressive_delay_seconds(_fail_count(identity, ip))
    if delay > 0:
        # Cap hard sleep so a single request cannot hold forever
        time.sleep(min(delay, 5 * 60))
        security_log('progressive_delay', f'{delay}s', identity=(identity or None))
    return delay


def record_login_failure(identity: str = '', ip: str | None = None) -> int:
    """Record a failed login. Returns progressive delay seconds applied after the failure."""
    ip = ip or client_ip()
    identity = (identity or '').strip().lower()[:80]
    now = _now()
    with _lock:
        dq = _login_fails[ip]
        _prune_deque(dq, LOGIN_FAIL_WINDOW_SEC, now)
        dq.append(now)
        fail_n = len(dq)
        if fail_n >= LOGIN_FAIL_LIMIT:
            _login_cooldown_until[ip] = now + LOGIN_COOLDOWN_SEC
            security_log(
                'login_ip_cooldown',
                f'>{LOGIN_FAIL_LIMIT} fails / {LOGIN_FAIL_WINDOW_SEC}s → {LOGIN_COOLDOWN_SEC}s',
                identity=identity or None,
            )
        if identity:
            aq = _account_fails[identity]
            _prune_deque(aq, ACCOUNT_LOCK_WINDOW_SEC, now)
            aq.append(now)
            fail_n = max(fail_n, len(aq))
            if len(aq) >= ACCOUNT_LOCK_FAILS:
                _account_lock_until[identity] = now + ACCOUNT_LOCK_SEC
                security_log(
                    'account_lockout',
                    f'{ACCOUNT_LOCK_FAILS}+ fails → {ACCOUNT_LOCK_SEC}s lock',
                    identity=identity,
                )
        # 50 failures also forces a 5-minute IP cooldown
        if fail_n >= 50:
            _ip_cooldown_until[ip] = max(_ip_cooldown_until.get(ip, 0), now + 5 * 60)
    security_log('login_failure', identity=identity or None, fails=fail_n)
    delay = progressive_delay_seconds(fail_n)
    if delay > 0:
        time.sleep(min(delay, 5 * 60))
    return delay


def clear_login_failures(identity: str = '', ip: str | None = None) -> None:
    ip = ip or client_ip()
    identity = (identity or '').strip().lower()[:80]
    with _lock:
        _login_fails.pop(ip, None)
        if identity:
            _account_fails.pop(identity, None)
            _account_lock_until.pop(identity, None)


def login_blocked(identity: str = '', ip: str | None = None) -> tuple[bool, str]:
    """Hard temporary lock / IP cooldown (no sleep)."""
    ip = ip or client_ip()
    identity = (identity or '').strip().lower()[:80]
    now = _now()
    with _lock:
        until = max(_login_cooldown_until.get(ip, 0), _ip_cooldown_until.get(ip, 0))
        if until > now:
            return True, f'Too many login attempts. Try again in {int(until - now)}s.'
        if identity:
            a_until = _account_lock_until.get(identity, 0)
            if a_until > now:
                return True, f'Account temporarily locked. Try again in {int(a_until - now)}s.'
    return False, ''


def prepare_login_attempt(identity: str = '', ip: str | None = None) -> tuple[bool, str]:
    """Hard-block check + progressive delay based on prior failures."""
    blocked, msg = login_blocked(identity, ip)
    if blocked:
        return True, msg
    apply_progressive_delay(identity, ip)
    return False, ''


def detect_bot(req: Optional[Request] = None, strict: bool = False) -> tuple[bool, str]:
    """Heuristic bot / empty-client detection. Does not block legitimate browsers."""
    req = req or request
    ua = (req.headers.get('User-Agent') or '').strip()
    if not ua or len(ua) < BOT_MIN_UA_LEN:
        return True, 'Missing or invalid client'
    bad_markers = ('sqlmap', 'nikto', 'nmap', 'masscan', 'curl/', 'wget/', 'python-requests')
    ua_l = ua.lower()
    if any(m in ua_l for m in bad_markers) and strict:
        return True, 'Automated client blocked'
    # Honeypot fields (must be empty if present)
    for field in ('website', 'company_url', 'fax_number', 'hp_field'):
        if request.method in _MUTATING:
            val = ''
            if request.is_json:
                body = request.get_json(silent=True) or {}
                val = str(body.get(field) or '')
            if not val:
                val = str(request.form.get(field) or '')
            if val.strip():
                security_log('honeypot_trip', field=field)
                return True, 'Rejected'
    return False, ''


# ---------------------------------------------------------------------------
# CSRF
# ---------------------------------------------------------------------------

def ensure_csrf_token() -> str:
    token = session.get('_csrf')
    if not token or len(token) < 32:
        token = secrets.token_urlsafe(32)
        session['_csrf'] = token
    return token


def validate_csrf(req: Optional[Request] = None) -> bool:
    req = req or request
    expected = session.get('_csrf') or ''
    if not expected:
        return False
    provided = (
        req.headers.get(CSRF_HEADER)
        or req.headers.get('X-CSRFToken')
        or (req.form.get(CSRF_FORM_FIELD) if req.form else None)
        or ''
    )
    if not provided and req.is_json:
        body = req.get_json(silent=True) or {}
        provided = str(body.get(CSRF_FORM_FIELD) or '')
    cookie_val = req.cookies.get(CSRF_COOKIE) or ''
    # Accept header/form token matching session, or double-submit cookie == session
    if provided and hmac.compare_digest(str(provided), str(expected)):
        return True
    if cookie_val and hmac.compare_digest(str(cookie_val), str(expected)):
        return True
    return False


def csrf_exempt(req: Optional[Request] = None) -> bool:
    req = req or request
    if req.method not in _MUTATING:
        return True
    # Bearer mobile tokens are not cookie CSRF targets
    auth = req.headers.get('Authorization') or ''
    if auth.lower().startswith('bearer '):
        return True
    path = req.path or ''
    # Public storefront GETs already exempt; login needs CSRF but we set token on GET first
    if path.startswith('/api/mobile/'):
        return True
    return False


# ---------------------------------------------------------------------------
# Input sanitization / NoSQL operator stripping
# ---------------------------------------------------------------------------

_CTRL_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')


def sanitize_text(value: Any, max_len: int = 500) -> str:
    text = _CTRL_RE.sub('', str(value if value is not None else ''))
    return text.strip()[:max_len]


def strip_mongo_operators(obj: Any, depth: int = 0) -> Any:
    """Remove keys starting with $ from user-supplied JSON (NoSQL injection guard)."""
    if depth > 8:
        return None
    if isinstance(obj, dict):
        clean = {}
        for k, v in obj.items():
            key = str(k)
            if key.startswith('$'):
                continue
            clean[key] = strip_mongo_operators(v, depth + 1)
        return clean
    if isinstance(obj, list):
        return [strip_mongo_operators(x, depth + 1) for x in obj[:500]]
    return obj


_INTERNAL_LEAK_RE = re.compile(
    r'(traceback|file\s+"|[/\\][Uu]sers[/\\]|[Cc]:\\|\.py\b|pymongo|mongodb|sql\s|exception|'
    r'werkzeug|flask\.|line\s+\d+|stack\s*trace|operationalerror|duplicatekey)',
    re.I,
)


def public_error(exc: Any = None, fallback: str = 'Something went wrong. Please try again.') -> str:
    """Never return tracebacks, DB errors, paths, or raw Python exceptions to clients."""
    if exc is None:
        return fallback
    if isinstance(exc, ValueError):
        msg = str(exc or '').strip()
        if msg and len(msg) <= 160 and not _INTERNAL_LEAK_RE.search(msg):
            return msg
    # Log server-side only
    try:
        security_log('suppressed_exception', type(exc).__name__)
    except Exception:
        pass
    return fallback


# ---------------------------------------------------------------------------
# Password hashing (Argon2 preferred, Werkzeug scrypt fallback)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    password = password or ''
    try:
        from argon2 import PasswordHasher
        return 'argon2$' + PasswordHasher().hash(password)
    except Exception:
        from werkzeug.security import generate_password_hash
        return generate_password_hash(password, method='scrypt')


def verify_password(stored: str, password: str) -> bool:
    stored = stored or ''
    password = password or ''
    if stored.startswith('argon2$'):
        try:
            from argon2 import PasswordHasher
            from argon2.exceptions import VerifyMismatchError
            PasswordHasher().verify(stored[len('argon2$'):], password)
            return True
        except Exception:
            return False
    from werkzeug.security import check_password_hash
    try:
        return check_password_hash(stored, password)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Mobile token (JWT-like claims: iss, aud, iat, nbf, exp, jti + HMAC)
# ---------------------------------------------------------------------------

def build_mobile_claims(member: dict, secret: str, ttl_days: int = 7) -> dict:
    now = datetime.utcnow()
    return {
        'uid': member.get('id'),
        'username': member.get('username') or '',
        'role': member.get('role') or '',
        'store_id': member.get('store_id') or '',
        'name': member.get('name') or member.get('username') or 'Staff',
        'iss': TOKEN_ISS,
        'aud': TOKEN_AUD,
        'iat': int(now.timestamp()),
        'nbf': int(now.timestamp()) - 5,
        'exp': int((now + timedelta(days=ttl_days)).timestamp()),
        'jti': secrets.token_hex(16),
    }


def sign_mobile_token(claims: dict, secret: str) -> str:
    import base64
    import json
    raw = base64.urlsafe_b64encode(
        json.dumps(claims, separators=(',', ':'), sort_keys=True).encode()
    ).decode().rstrip('=')
    sig = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return f'{raw}.{sig}'


def verify_mobile_token_claims(token: str, secret: str) -> Optional[dict]:
    import base64
    import json
    if not token or '.' not in token:
        return None
    raw, sig = token.rsplit('.', 1)
    expected = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    pad = '=' * (-len(raw) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(raw + pad).decode())
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    now = int(datetime.utcnow().timestamp())
    exp = int(payload.get('exp') or 0)
    if exp < now:
        return None
    # New tokens must carry iss/aud; legacy tokens (pre-hardening) only need exp.
    if 'iss' in payload or 'aud' in payload:
        if payload.get('iss') != TOKEN_ISS:
            return None
        if payload.get('aud') != TOKEN_AUD:
            return None
        nbf = int(payload.get('nbf') or 0)
        if nbf and now < nbf:
            return None
        iat = int(payload.get('iat') or 0)
        if iat and iat > now + 60:
            return None
    return payload


# ---------------------------------------------------------------------------
# File upload helpers
# ---------------------------------------------------------------------------

_IMAGE_MAGIC = (
    (b'\xff\xd8\xff', 'jpg'),
    (b'\x89PNG\r\n\x1a\n', 'png'),
    (b'GIF87a', 'gif'),
    (b'GIF89a', 'gif'),
    (b'RIFF', 'webp'),  # further checked
)


def validate_image_bytes(data: bytes, declared_ext: str = '') -> tuple[bool, str]:
    if not data or len(data) < 12:
        return False, 'Empty or truncated image'
    if len(data) > 16 * 1024 * 1024:
        return False, 'File too large'
    head = data[:16]
    ok = False
    for magic, kind in _IMAGE_MAGIC:
        if head.startswith(magic):
            if kind == 'webp' and b'WEBP' not in data[:32]:
                continue
            ok = True
            break
    if not ok:
        # Let Pillow be the final arbiter when available
        try:
            from io import BytesIO
            from PIL import Image
            img = Image.open(BytesIO(data))
            img.verify()
            ok = True
        except Exception:
            return False, 'Unrecognized image content'
    return True, ''


# ---------------------------------------------------------------------------
# Flask integration
# ---------------------------------------------------------------------------

def register_security(app: Flask, *, secret_key: str, production: bool = False) -> None:
    """Attach before/after hooks and error handlers."""

    @app.before_request
    def _security_before_request():
        g._req_started = _now()
        path = request.path or ''

        # OPTIONS preflight for mobile CORS
        if request.method == 'OPTIONS' and path.startswith('/api/mobile'):
            return ('', 204)

        # Global temporary IP cooldown + API rate window
        if not any(path.startswith(p) for p in _RATE_EXEMPT_PREFIXES):
            blocked, msg = is_ip_cooling()
            if blocked:
                security_log('rejected_cooldown', msg)
                return jsonify({'error': 'Too many requests. Please try again later.'}), 429
            if path.startswith('/api/') or path.startswith('/admin/login'):
                limited, msg = record_api_hit()
                if limited:
                    return jsonify({'error': msg}), 429

        # Login throttling gate (API auth endpoints)
        if path in _LOGIN_PATHS and request.method == 'POST':
            identity = ''
            if request.is_json:
                body = request.get_json(silent=True) or {}
                identity = str(body.get('username') or body.get('phone') or '')
            else:
                identity = str(request.form.get('username') or request.form.get('phone') or '')
            blocked, msg = login_blocked(identity)
            if blocked:
                security_log('login_blocked', msg, identity=identity.lower())
                if path == '/admin/login':
                    from flask import make_response, render_template
                    resp = make_response(
                        render_template('admin/login.html', error=msg, db_mode='—', csrf_token=ensure_csrf_token()),
                        429,
                    )
                    return resp
                return jsonify({'error': msg}), 429

            bot, bot_msg = detect_bot(strict=path.startswith('/api/auth'))
            if bot:
                security_log('bot_rejected', bot_msg)
                if path == '/admin/login':
                    from flask import make_response, render_template
                    return make_response(
                        render_template('admin/login.html', error='Request rejected', db_mode='—', csrf_token=ensure_csrf_token()),
                        403,
                    )
                return jsonify({'error': 'Request rejected'}), 403

        # CSRF for cookie-authenticated mutating requests
        if not csrf_exempt():
            ensure_csrf_token()
            needs = bool(
                session.get('admin_ok')
                or session.get('customer_id')
                or path == '/admin/login'
                or path.startswith('/api/account')
                or path.startswith('/api/auth/')
                or path.startswith('/api/admin')
                or path.startswith('/api/orders')
            )
            if needs and request.method in _MUTATING:
                if not validate_csrf():
                    security_log('csrf_rejected', path)
                    if path == '/admin/login':
                        from flask import make_response, render_template
                        return make_response(
                            render_template(
                                'admin/login.html',
                                error='Security token expired. Please refresh and try again.',
                                db_mode='—',
                                csrf_token=ensure_csrf_token(),
                            ),
                            403,
                        )
                    return jsonify({'error': 'CSRF validation failed. Refresh the page and try again.'}), 403

    @app.after_request
    def _security_after_request(response: Response):
        # Always refresh CSRF cookie for same-origin browsers
        try:
            token = ensure_csrf_token()
            response.set_cookie(
                CSRF_COOKIE,
                token,
                httponly=False,
                samesite='Lax',
                secure=bool(app.config.get('SESSION_COOKIE_SECURE')),
                max_age=60 * 60 * 12,
                path='/',
            )
            response.headers.setdefault(CSRF_HEADER, token)
        except Exception:
            pass

        started = getattr(g, '_req_started', None)
        if started:
            ms = int((_now() - started) * 1000)
            response.headers.setdefault('X-Response-Time-ms', str(ms))
            if ms > 25000:
                security_log('slow_request', f'{ms}ms')

        response.headers.setdefault('X-Content-Type-Options', 'nosniff')
        return response

    @app.errorhandler(413)
    def _too_large(_err):
        return jsonify({'error': 'Request too large'}), 413

    @app.errorhandler(429)
    def _too_many(_err):
        return jsonify({'error': 'Too many requests. Please try again later.'}), 429

    @app.errorhandler(Exception)
    def _unhandled(err):
        from werkzeug.exceptions import HTTPException
        # Never expose traceback / DB / paths / Python internals to clients
        if isinstance(err, HTTPException):
            code = err.code or 500
            if (request.path or '').startswith('/api/') or request.is_json:
                return jsonify({'error': public_error(None, err.description or 'Request could not be completed')}), code
            return err
        try:
            security_log('unhandled', type(err).__name__)
        except Exception:
            pass
        return jsonify({'error': 'Something went wrong. Please try again.'}), 500

    @app.route('/api/csrf-token', methods=['GET'])
    def api_csrf_token():
        token = ensure_csrf_token()
        return jsonify({'csrf_token': token})
