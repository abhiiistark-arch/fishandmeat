# Gunicorn config for Fish and Meat (nginx → gunicorn → Flask)
# Usage:
#   gunicorn -c gunicorn.conf.py "app:app"
# Or:
#   gunicorn -c gunicorn.conf.py "app:application"
#
# Do NOT use --preload with MongoDB unless post_fork resets the client.

import os
import multiprocessing

# Bind behind nginx on localhost (change if needed)
bind = os.getenv('GUNICORN_BIND', '127.0.0.1:8000')

# Multi-worker: (2 x CPU) + 1 is a common starting point
_workers_env = os.getenv('GUNICORN_WORKERS', '').strip()
if _workers_env:
    workers = max(1, int(_workers_env))
else:
    workers = max(2, min(8, (multiprocessing.cpu_count() or 2) * 2 + 1))

worker_class = os.getenv('GUNICORN_WORKER_CLASS', 'sync')
threads = int(os.getenv('GUNICORN_THREADS', '1'))
timeout = int(os.getenv('GUNICORN_TIMEOUT', '120'))
graceful_timeout = int(os.getenv('GUNICORN_GRACEFUL_TIMEOUT', '30'))
keepalive = int(os.getenv('GUNICORN_KEEPALIVE', '5'))
max_requests = int(os.getenv('GUNICORN_MAX_REQUESTS', '1000'))
max_requests_jitter = int(os.getenv('GUNICORN_MAX_REQUESTS_JITTER', '100'))

# Access / error logs — "-" = stdout/stderr (systemd/journald friendly)
accesslog = os.getenv('GUNICORN_ACCESSLOG', '-')
errorlog = os.getenv('GUNICORN_ERRORLOG', '-')
loglevel = os.getenv('GUNICORN_LOGLEVEL', 'info')
capture_output = True
preload_app = os.getenv('GUNICORN_PRELOAD', '0').lower() in ('1', 'true', 'yes')

# Forwarded allow list unused when ProxyFix is enabled in app.py;
# still set secure scheme header name for clarity.
forwarded_allow_ips = os.getenv('GUNICORN_FORWARDED_ALLOW_IPS', '127.0.0.1')


def post_fork(server, worker):
    """Each worker gets a fresh Mongo client (required if preload_app=True)."""
    try:
        import app as fam_app
        fam_app.reset_mongo_after_fork()
        server.log.info('worker=%s mongo=%s', worker.pid, fam_app.db_mode())
    except Exception as exc:  # noqa: BLE001
        server.log.warning('post_fork mongo reset failed: %s', exc)


def worker_exit(server, worker):
    try:
        import app as fam_app
        fam_app.close_mongo()
    except Exception:
        pass
