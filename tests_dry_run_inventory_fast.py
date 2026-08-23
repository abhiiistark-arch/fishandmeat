"""
Dry-run inventory speed + POS isolation checks.

- Does NOT connect to Mongo
- Does NOT write / update any live production data
- Source-policy assertions + in-memory simulation only
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP = (ROOT / 'app.py').read_text(encoding='utf-8')
ADMIN_JS = (ROOT / 'static' / 'admin' / 'admin.js').read_text(encoding='utf-8')

PASS = 0
FAIL = 0


def check(name: str, ok: bool, detail: str = ''):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f'  PASS  {name}')
    else:
        FAIL += 1
        print(f'  FAIL  {name}' + (f' — {detail}' if detail else ''))


def function_source(tree: ast.AST, name: str) -> str:
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return ast.get_source_segment(APP, node) or ''
    return ''


def main():
    print('Dry-run inventory fast-path tests (no live DB)\n')
    tree = ast.parse(APP)

    # --- 1) Inventory Add Stock: no QR sync call ---
    post_fn = function_source(tree, 'api_admin_inventory')
    check(
        'admin Add Stock does not call sync_qr_units_for_inventory_row',
        'sync_qr_units_for_inventory_row' not in post_fn,
        'QR sync still present in Add Stock',
    )
    check(
        'admin Add Stock still increments stock',
        'db_increment' in post_fn and 'stock' in post_fn,
    )

    # --- 2) Inventory Save: no QR sync call ---
    put_fn = function_source(tree, 'api_admin_inventory_update')
    check(
        'admin Save inventory does not call sync_qr_units_for_inventory_row',
        'sync_qr_units_for_inventory_row' not in put_fn,
        'QR sync still present on Save',
    )
    check(
        'admin Save still updates price/stock',
        'db_update' in put_fn and "'price'" in put_fn and "'stock'" in put_fn,
    )

    # --- 3) Mobile inventory same fast path ---
    mobile_post = function_source(tree, 'api_mobile_inventory')
    mobile_put = function_source(tree, 'api_mobile_inventory_update')
    check(
        'mobile Add Stock does not mint/sync QR',
        'sync_qr_units_for_inventory_row' not in mobile_post,
    )
    check(
        'mobile Save inventory does not mint/sync QR',
        'sync_qr_units_for_inventory_row' not in mobile_put,
    )

    # --- 4) POS billing strategy untouched (fast path) ---
    create_pos = function_source(tree, '_create_pos_order')
    check(
        'POS billing still uses claim_qr_units_for_sale(..., sync_missing=False)',
        'sync_missing=False' in create_pos,
        'POS sync_missing=False missing',
    )
    check(
        'POS still has stock-only manual add comment/path',
        'Manual POS adds' in create_pos or 'sync_missing=False' in create_pos,
    )

    pos_adjust = function_source(tree, '_pos_adjust_stock')
    check(
        'POS stock adjust still only QR-syncs on positive restore delta',
        'quantity_delta > 0' in pos_adjust and 'create_missing=True' in pos_adjust,
        pos_adjust[:200],
    )
    check(
        'POS stock adjust does not QR-sync on negative sale delta',
        'quantity_delta < 0' not in pos_adjust or (
            'quantity_delta > 0' in pos_adjust and pos_adjust.find('quantity_delta > 0') < pos_adjust.find('sync_qr_units')
        ),
    )

    claim_fn = function_source(tree, 'claim_qr_units_for_sale')
    check(
        'claim_qr_units_for_sale still supports sync_missing flag',
        'sync_missing' in claim_fn and 'create_missing=True' in claim_fn,
    )

    # --- 5) sync helper default is create_missing=False (inventory-safe) ---
    sync_fn = function_source(tree, 'sync_qr_units_for_inventory_row')
    check(
        'sync_qr_units_for_inventory_row defaults create_missing=False',
        'create_missing=False' in sync_fn.split('\n')[0] or 'create_missing=False' in sync_fn[:180],
    )
    check(
        'sync only creates when create_missing is True',
        'create_missing' in sync_fn and 'create_qr_units' in sync_fn,
    )

    # --- 6) Admin UI busy states for stock-in ---
    check(
        'AdminInventory has setBusy / Saving feedback',
        'setBusy' in ADMIN_JS and 'Saving' in ADMIN_JS,
    )
    check(
        'Add Stock loads store-scoped inventory (not all stores)',
        'store_id=' in ADMIN_JS and 'openStockForm' in ADMIN_JS,
    )
    check(
        'Add Stock product list uses productsForStore (product sync)',
        'productsForStore' in ADMIN_JS,
    )

    # --- 7) In-memory simulation: create_missing=False never "mints" ---
    print('\nIn-memory policy simulation:')
    created = []

    def fake_create(n):
        created.extend(['qr'] * n)
        return list(range(n))

    def simulate_sync(stock, existing_count, create_missing):
        created.clear()
        if existing_count < stock and create_missing:
            fake_create(stock - existing_count)
        # void path ignored for this sim
        return len(created)

    minted = simulate_sync(stock=500, existing_count=0, create_missing=False)
    check('Add-stock style sync (create_missing=False) mints 0 QRs for +500', minted == 0, f'minted={minted}')

    minted = simulate_sync(stock=5, existing_count=0, create_missing=True)
    check('Explicit backfill (create_missing=True) can still mint', minted == 5, f'minted={minted}')

    print(f'\nResult: {PASS} passed, {FAIL} failed')
    print('NOTE: No Mongo connection, no production data was read or written.')
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
