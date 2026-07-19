"""
Load test for Fish and Meat.

Fires N requests with a pool of concurrent workers across a realistic
read-heavy traffic mix, plus a small share of order placements (writes).
Reports success rate, status breakdown, throughput and latency percentiles.

Run (server must be up):  python load_test.py [total] [concurrency]
"""
import sys
import time
import random
import statistics
from concurrent.futures import ThreadPoolExecutor

import requests

BASE = 'http://127.0.0.1:5000'
TOTAL = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
CONCURRENCY = int(sys.argv[2]) if len(sys.argv) > 2 else 50

# Discover ids up front
boot = requests.Session()
PRODUCTS = boot.get(BASE + '/api/products', timeout=30).json()
STORES = boot.get(BASE + '/api/stores', timeout=30).json()
PIDS = [p['id'] for p in PRODUCTS]
SIDS = [s['id'] for s in STORES]

# (label, weight, callable) — weights approximate real browsing behavior
def _home(s):
    return s.get(BASE + '/', timeout=30)

def _products(s):
    sid = random.choice(SIDS)
    return s.get(BASE + f'/api/products?store_id={sid}', timeout=30)

def _product_detail(s):
    return s.get(BASE + f'/api/products/{random.choice(PIDS)}', timeout=30)

def _stores(s):
    return s.get(BASE + '/api/stores', timeout=30)

def _categories(s):
    return s.get(BASE + '/api/categories', timeout=30)

def _settings(s):
    return s.get(BASE + '/api/settings', timeout=30)

def _image(s):
    p = random.choice(PRODUCTS)
    imgs = p.get('images') or []
    if imgs:
        return s.get(BASE + imgs[0], timeout=30)
    return s.get(BASE + '/api/health', timeout=30)

def _place_order(s):
    sid = random.choice(SIDS)
    prods = boot_products_for_store(sid)
    if not prods:
        return s.get(BASE + '/api/health', timeout=30)
    p = random.choice(prods)
    inv = p['store_inventory'][0]
    payload = {
        'name': 'LoadTest User', 'phone': '900' + ''.join(random.choice('0123456789') for _ in range(7)),
        'address': 'Load Test Rd', 'store_id': sid, 'delivery_mode': 'delivery',
        'channel': 'loadtest',
        'items': [{'product_id': p['id'], 'variant_id': inv['variant_id'], 'qty': 1}],
    }
    return s.post(BASE + '/api/orders', json=payload, timeout=30)

_store_cache = {}
def boot_products_for_store(sid):
    if sid not in _store_cache:
        try:
            data = boot.get(BASE + f'/api/products?store_id={sid}', timeout=30).json()
            _store_cache[sid] = [p for p in data if p.get('store_inventory')]
        except Exception:
            _store_cache[sid] = []
    return _store_cache[sid]

MIX = [
    ('GET /', 22, _home),
    ('GET /api/products', 26, _products),
    ('GET /api/products/:id', 16, _product_detail),
    ('GET /api/stores', 8, _stores),
    ('GET /api/categories', 8, _categories),
    ('GET /api/settings', 5, _settings),
    ('GET /uploads image', 10, _image),
    ('POST /api/orders', 5, _place_order),
]
_total_w = sum(w for _, w, _ in MIX)


def pick():
    r = random.uniform(0, _total_w)
    upto = 0
    for label, w, fn in MIX:
        upto += w
        if r <= upto:
            return label, fn
    return MIX[-1][0], MIX[-1][2]


results = []  # (label, status, elapsed_ms, ok)
_thread_local = None


def worker(_i):
    s = requests.Session()
    label, fn = pick()
    t0 = time.perf_counter()
    try:
        r = fn(s)
        dt = (time.perf_counter() - t0) * 1000
        ok = 200 <= r.status_code < 400 or (label.startswith('POST') and r.status_code in (201, 400))
        return (label, r.status_code, dt, ok)
    except Exception as e:  # noqa: BLE001
        dt = (time.perf_counter() - t0) * 1000
        return (label, type(e).__name__, dt, False)
    finally:
        s.close()


def pct(sorted_vals, p):
    if not sorted_vals:
        return 0
    k = int(round((p / 100) * (len(sorted_vals) - 1)))
    return sorted_vals[k]


def main():
    print(f'Load test: {TOTAL} requests, {CONCURRENCY} concurrent workers -> {BASE}')
    print(f'Discovered {len(PIDS)} products, {len(SIDS)} stores')
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        for res in ex.map(worker, range(TOTAL)):
            results.append(res)
    wall = time.perf_counter() - start

    ok = sum(1 for _, _, _, o in results if o)
    fail = TOTAL - ok
    lat = sorted(dt for _, _, dt, _ in results)
    status_counts = {}
    for _, st, _, _ in results:
        status_counts[st] = status_counts.get(st, 0) + 1
    by_ep = {}
    for label, st, dt, o in results:
        b = by_ep.setdefault(label, {'n': 0, 'ok': 0, 'lat': []})
        b['n'] += 1
        b['ok'] += 1 if o else 0
        b['lat'].append(dt)

    print('\n================ RESULTS ================')
    print(f'Total requests   : {TOTAL}')
    print(f'Wall time        : {wall:.2f}s')
    print(f'Throughput       : {TOTAL / wall:.1f} req/s')
    print(f'Success          : {ok} ({ok / TOTAL * 100:.1f}%)')
    print(f'Failures         : {fail} ({fail / TOTAL * 100:.1f}%)')
    print('\nLatency (ms):')
    print(f'  min {lat[0]:.0f} | p50 {pct(lat,50):.0f} | p90 {pct(lat,90):.0f} | '
          f'p95 {pct(lat,95):.0f} | p99 {pct(lat,99):.0f} | max {lat[-1]:.0f} | avg {statistics.mean(lat):.0f}')
    print('\nStatus code / error breakdown:')
    for st, c in sorted(status_counts.items(), key=lambda x: str(x[0])):
        print(f'  {st}: {c}')
    print('\nPer-endpoint (n | ok% | p50ms | p95ms):')
    for label, b in sorted(by_ep.items()):
        bl = sorted(b['lat'])
        print(f'  {label:26s} {b["n"]:4d} | {b["ok"] / b["n"] * 100:5.1f}% | '
              f'{pct(bl,50):6.0f} | {pct(bl,95):6.0f}')
    print('=========================================')
    verdict = 'PASS — no crashes, server stable' if fail == 0 else (
        'MOSTLY OK — some failures, see breakdown' if fail / TOTAL < 0.02 else 'ATTENTION — elevated failures')
    print('VERDICT:', verdict)


if __name__ == '__main__':
    main()
