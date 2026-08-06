# Security

Fish and Meat applies layered controls in `security.py` + `app.py`.

## Progressive login delays
| Failures | Delay before answer |
|---------|---------------------|
| 5 | 2 seconds |
| 10 | 5 seconds |
| 20 | 30 seconds |
| 50 | 5 minutes (+ temporary lock / IP cooldown) |

Also: >10 failures / 10 minutes → 15-minute IP cooldown; >100 API req / minute → HTTP 429 for 1 minute.

## Never exposed to clients
Tracebacks, database/SQL errors, internal file paths, and raw Python exceptions are suppressed. Clients get generic messages; details stay in security logs.

## Other controls
Rate limiting, bot heuristics + honeypot, CSRF (cookie sessions), Argon2/scrypt password hashing, HMAC mobile tokens with iss/aud/iat/nbf/exp/jti, security headers, upload magic-byte checks, request size limits, secure cookies, production debug off.
