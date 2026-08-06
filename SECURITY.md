# Security

Fish and Meat applies layered controls in `security.py` + `app.py`.

## Progressive login delays
| Failures | Retry gate (instant 429 — **no server sleep**) |
|---------|-----------------------------------------------|
| **5** | wait 2 seconds |
| **10** | wait 5 seconds |
| **20** | wait 30 seconds |
| **50** | wait 5 minutes (+ temporary lock) |

Also: >10 login fails / 10 minutes → 15-minute **login-only** cooldown (does not block the rest of the site).
API burst: high limits; **GET requests are not rate-counted** so admin UI stays instant.

## Never exposed to clients
Tracebacks, database/SQL errors, internal file paths, and raw Python exceptions are suppressed. Clients get generic messages; details stay in security logs.

## Other controls
Rate limiting, bot heuristics + honeypot, CSRF (cookie sessions), Argon2/scrypt password hashing, HMAC mobile tokens with iss/aud/iat/nbf/exp/jti, security headers, upload magic-byte checks, request size limits, secure cookies, production debug off.
