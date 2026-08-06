"""Production WSGI runner (Waitress) for Fish and Meat.

Usage:  python run_prod.py
Serves the Flask app with a thread pool suitable for handling many
concurrent customers. Tune threads via the FAM_THREADS env var.
"""
import os
from waitress import serve

import app

if __name__ == '__main__':
    threads = int(os.getenv('FAM_THREADS', '16'))
    host = os.getenv('FAM_HOST', '127.0.0.1')
    port = int(os.getenv('FAM_PORT', '5000'))
    print(f'[waitress] serving Fish and Meat on http://{host}:{port} '
          f'(threads={threads}, db={app.db_mode()})')
    serve(
        app.app,
        host=host,
        port=port,
        threads=threads,
        connection_limit=1000,
        channel_timeout=30,
        cleanup_interval=30,
    )
