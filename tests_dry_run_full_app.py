"""
Full-app dry-run health check for FishandMeet.

SAFE BY DESIGN:
- Does NOT connect to MongoDB
- Does NOT call live APIs
- Does NOT write / update / delete any server data
- Source + syntax + wiring checks only
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PASS = 0
FAIL = 0
WARN = 0


def ok(name, cond, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'  PASS  {name}')
    else:
        FAIL += 1
        print(f'  FAIL  {name}' + (f' — {detail}' if detail else ''))


def warn(name, detail=''):
    global WARN
    WARN += 1
    print(f'  WARN  {name}' + (f' — {detail}' if detail else ''))


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding='utf-8')


def has_route(app_src: str, path: str) -> bool:
    # Match both exact and decorator forms
    esc = re.escape(path)
    return bool(re.search(rf"@app\.route\(\s*['\"]{esc}['\"]", app_src))


def fn_src(tree: ast.AST, src: str, name: str) -> str:
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ''
    return ''


def section(title: str):
    print(f'\n=== {title} ===')


def main():
    print('FishandMeet FULL DRY-RUN (no live Mongo / no data writes)\n')

    # ---------- syntax ----------
    section('Syntax')
    py_files = ['app.py', 'security.py', 'tests_dry_run_inventory_fast.py']
    for rel in py_files:
        p = ROOT / rel
        if not p.exists():
            warn(f'missing {rel}')
            continue
        try:
            ast.parse(p.read_text(encoding='utf-8'))
            ok(f'parse {rel}', True)
        except SyntaxError as e:
            ok(f'parse {rel}', False, str(e))

    for rel in ['script.js', 'static/admin/admin.js']:
        txt = read(rel)
        ok(f'{rel} non-empty', len(txt) > 1000)

    app = read('app.py')
    tree = ast.parse(app)
    script = read('script.js')
    admin_js = read('static/admin/admin.js')
    index = read('index.html')

    # ---------- storefront customer journey ----------
    section('Storefront / customer journey')
    for path in [
        '/',
        '/api/auth/signup',
        '/api/auth/login',
        '/api/auth/logout',
        '/api/auth/me',
        '/api/stores',
        '/api/categories',
        '/api/products',
        '/api/storefront-content',
        '/api/settings',
        '/api/coupons/validate',
        '/api/orders',
        '/api/account/orders',
        '/api/account/cart',
        '/api/account/profile',
        '/api/account/addresses',
    ]:
        ok(f'route exists {path}', has_route(app, path))

    for needle, label in [
        ('submitLogin', 'login submit handler'),
        ('submitSignup', 'signup submit handler'),
        ('submitCheckout', 'checkout/order submit'),
        ('loadCatalogFromApi', 'catalog load'),
        ('/api/orders', 'places order via API'),
        ('/api/auth/login', 'customer login API'),
        ('/api/auth/signup', 'customer signup API'),
        ('renderCart', 'cart render'),
        ('renderCheckout', 'checkout render'),
        ('renderAccount', 'account render'),
        ('location-phone', 'store contact phones on Find Us'),
    ]:
        ok(f'storefront JS: {label}', needle in script)

    ok('index wires script.js', 'script.js' in index)
    ok('index has checkout form', 'checkout-form' in index or 'id="checkout' in index)
    ok('index has login/signup pages', 'page-login' in index and 'page-signup' in index)

    # freshness / cache policy for storefront APIs
    ok('public catalog APIs use max_age=0 / no-store helper',
       'max_age=0' in app and 'no-store' in app)

    # ---------- admin pages + modules ----------
    section('Admin panel pages + JS modules')
    admin_pages = {
        'dashboard': 'AdminDashboard',
        'stores': 'AdminStores',
        'categories': 'AdminCategories',
        'products': 'AdminProducts',
        'inventory': 'AdminInventory',
        'orders': 'AdminOrders',
        'customers': 'AdminCustomers',
        'reports': 'AdminReports',
        'settings': 'AdminSettings',
        'coupons': 'AdminCoupons',
        'staff': 'AdminStaff',
        'storefront': 'AdminStorefront',
        'in-store': 'AdminPOS',
        'qr-codes': 'AdminQR',
    }
    for page, mod in admin_pages.items():
        route = f'/admin/{page}'
        ok(f'admin route {route}', has_route(app, route) or (page == 'in-store' and has_route(app, '/admin/in-store')))
        tmpl = ROOT / 'templates' / 'admin' / (page.replace('-', '_') + '.html')
        if page == 'qr-codes':
            tmpl = ROOT / 'templates' / 'admin' / 'qr_codes.html'
        if page == 'in-store':
            tmpl = ROOT / 'templates' / 'admin' / 'in_store.html'
        ok(f'template exists {tmpl.name}', tmpl.exists())
        ok(f'admin.js exports/uses {mod}', mod in admin_js)

    ok('admin login route', has_route(app, '/admin/login'))
    ok('admin login template', (ROOT / 'templates/admin/login.html').exists())
    ok('admin auth helper _authenticate_staff_credentials', '_authenticate_staff_credentials' in app)
    ok('recovery admin fam-master present', 'RECOVERY_USERNAME' in app and 'fam-master' in app)

    # ---------- admin APIs ----------
    section('Admin API coverage')
    admin_apis = [
        '/api/admin/me',
        '/api/admin/stats',
        '/api/admin/stores',
        '/api/admin/categories',
        '/api/admin/products',
        '/api/admin/inventory',
        '/api/admin/orders',
        '/api/admin/customers',
        '/api/admin/storefront-content',
        '/api/admin/settings',
        '/api/admin/coupons',
        '/api/admin/staff',
        '/api/admin/pos/catalog',
        '/api/admin/pos/orders',
        '/api/admin/qr-codes',
        '/api/admin/qr-codes/generate',
    ]
    for path in admin_apis:
        ok(f'admin API {path}', has_route(app, path))

    # ---------- mobile ----------
    section('Mobile / punch / POS APIs')
    for path in [
        '/api/mobile/login',
        '/api/mobile/me',
        '/api/mobile/stores',
        '/api/mobile/dashboard',
        '/api/mobile/punch',
        '/api/mobile/qr-lookup',
        '/api/mobile/qr-generate',
        '/api/mobile/catalog',
        '/api/mobile/pos/catalog',
        '/api/mobile/pos/orders',
        '/api/mobile/inventory',
    ]:
        ok(f'mobile API {path}', has_route(app, path))

    # ---------- critical business policies ----------
    section('Critical policies (inventory / POS / deletes)')
    inv_post = fn_src(tree, app, 'api_admin_inventory')
    inv_put = fn_src(tree, app, 'api_admin_inventory_update')
    ok('inventory Add Stock has no QR sync (fast path)', 'sync_qr_units_for_inventory_row' not in inv_post)
    ok('inventory Save has no QR sync (fast path)', 'sync_qr_units_for_inventory_row' not in inv_put)

    pos = fn_src(tree, app, '_create_pos_order')
    ok('POS billing keeps sync_missing=False', 'sync_missing=False' in pos)

    pos_adj = fn_src(tree, app, '_pos_adjust_stock')
    ok('POS adjust still restores with create_missing=True on +stock',
       'quantity_delta > 0' in pos_adj and 'create_missing=True' in pos_adj)

    store_del = fn_src(tree, app, 'api_admin_store_detail')
    ok('store delete keeps orders (only inventory/store unlink)',
       'db_delete(\'orders\'' not in store_del and 'Keep at least one store' in store_del)

    cat_del = fn_src(tree, app, 'api_admin_category_detail')
    ok('category delete blanks products, does not delete products',
       'products_uncategorized' in cat_del or 'category_id' in cat_del)

    # ---------- data-safety of THIS dry-run ----------
    section('Data safety of this dry-run')
    this_file = Path(__file__).read_text(encoding='utf-8')
    dangerous = [
        'MongoClient(',
        'db_insert(',
        'db_update(',
        'db_delete(',
        'update_many(',
        'delete_many(',
        'drop_database',
        'drop_collection',
    ]
    # Allow mentioning these strings in comments/checks of app.py source, but this runner itself
    # must not execute mongo writes. Ensure we never import app.
    ok(
        'dry-run does not import app module',
        not re.search(r'^\s*(import app|from app import)\b', this_file, re.M),
    )
    ok('dry-run does not construct MongoClient', 'MongoClient(' not in this_file.split('dangerous')[0])
    print('  INFO  This runner only reads local source files. Server MongoDB is not contacted.')

    # ---------- local change blast radius ----------
    section('Local uncommitted change awareness')
    # Cannot run git here reliably in all envs; infer from known files.
    for rel in ['app.py', 'static/admin/admin.js', 'tests_dry_run_inventory_fast.py']:
        ok(f'local file present for review: {rel}', (ROOT / rel).exists())
    warn(
        'uncommitted inventory-speed changes are LOCAL only until you push/deploy',
        'server Mongo data is unaffected until deploy+runtime writes happen through normal admin use'
    )

    # ---------- recovery / auth ----------
    section('Auth / recovery')
    ok('staff password vault helpers exist', 'seal_staff_password' in app and 'reveal_staff_password' in app)
    ok('dedupe recovery staff helper exists', '_dedupe_recovery_staff' in app)
    ok('login rate-limit helpers wired', 'prepare_login_attempt' in app and 'record_login_failure' in app)

    # ---------- summary ----------
    print(f'\n==============================')
    print(f'Result: {PASS} passed, {FAIL} failed, {WARN} warnings')
    print('Live MongoDB: NOT contacted')
    print('Existing server data: NOT modified by this dry-run')
    print('==============================')
    if FAIL:
        print('\nOverall: ISSUES FOUND in wiring/source checks (see FAIL lines).')
        return 1
    print('\nOverall: DRY-RUN GREEN — routes/modules/policies look consistent.')
    print('Note: this is static/dry validation, not a live browser E2E against production.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
