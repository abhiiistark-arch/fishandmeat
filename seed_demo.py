"""
Seed rich demo data for Fish and Meat.

- Generates branded product images (PIL) into uploads/products/
- Attaches image URLs to products
- Adds staff + coupons
- Generates a realistic spread of customers and orders across the last 12 months

Idempotent: demo customers/orders are tagged {'demo': True} and cleared before re-inserting.
Run:  python seed_demo.py
"""
import random
import math
from datetime import datetime, timedelta

from PIL import Image, ImageDraw, ImageFont

# Importing app connects to the DB (Mongo if configured) and base-seeds if empty
import app
from app import (
    db_find, db_find_one, db_insert, db_update, db_count,
    db_mode, new_id, UPLOAD_DIR, save_upload_bytes, sync_local_uploads_to_media,
)

random.seed(42)

# ---------------------------------------------------------------------------
# 1. Product images
# ---------------------------------------------------------------------------

CATEGORY_COLORS = {
    'cat_fish':        ((16, 94, 120), (32, 148, 170)),   # teal
    'cat_fresh_meat':  ((122, 30, 28), (165, 52, 42)),    # maroon/red
    'cat_frozen':      ((36, 78, 120), (86, 140, 190)),   # icy blue
    'cat_rtc':         ((150, 92, 20), (231, 180, 48)),   # gold
    'cat_marinades':   ((140, 60, 16), (214, 120, 40)),   # deep orange
    'cat_veg':         ((30, 90, 46), (86, 156, 78)),     # green
}
DEFAULT_COLORS = ((30, 58, 34), (46, 92, 54))
GOLD = (231, 180, 48)
CREAM = (251, 246, 236)


def _font(size, bold=False):
    candidates = [
        'C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf',
        'C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf',
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _vertical_gradient(w, h, top, bottom):
    base = Image.new('RGB', (w, h), top)
    top_r, top_g, top_b = top
    bot_r, bot_g, bot_b = bottom
    draw = ImageDraw.Draw(base)
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(top_r + (bot_r - top_r) * t)
        g = int(top_g + (bot_g - top_g) * t)
        b = int(top_b + (bot_b - top_b) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return base


def _wrap(draw, text, font, max_w):
    words = text.split()
    lines, cur = [], ''
    for w in words:
        trial = (cur + ' ' + w).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def make_product_image(path, name, category_label, category_id):
    W, H = 800, 600
    top, bottom = CATEGORY_COLORS.get(category_id, DEFAULT_COLORS)
    img = _vertical_gradient(W, H, top, bottom)
    draw = ImageDraw.Draw(img)

    # subtle diagonal sheen
    sheen = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    for i in range(-H, W, 46):
        sd.line([(i, 0), (i + H, H)], fill=(255, 255, 255, 8), width=18)
    img = Image.alpha_composite(img.convert('RGBA'), sheen).convert('RGB')
    draw = ImageDraw.Draw(img)

    # gold frame
    draw.rectangle([18, 18, W - 18, H - 18], outline=GOLD, width=3)

    # brand eyebrow
    eyebrow = _font(24, bold=True)
    draw.text((40, 40), 'FISH AND MEAT', font=eyebrow, fill=GOLD)

    # category chip
    chip = _font(22, bold=True)
    ctext = category_label.upper()
    cw = draw.textlength(ctext, font=chip)
    draw.rounded_rectangle([40, 84, 40 + cw + 32, 122], radius=16, fill=(0, 0, 0, 0), outline=CREAM, width=2)
    draw.text((56, 90), ctext, font=chip, fill=CREAM)

    # product name (wrapped, centered vertically-ish)
    title = _font(58, bold=True)
    lines = _wrap(draw, name, title, W - 120)
    total_h = len(lines) * 66
    y = (H - total_h) // 2 + 20
    for line in lines:
        lw = draw.textlength(line, font=title)
        draw.text(((W - lw) / 2, y), line, font=title, fill=CREAM)
        y += 66

    # footer tagline
    tag = _font(26)
    tagline = 'Farm Fresh · Delivered Cold'
    tw = draw.textlength(tagline, font=tag)
    draw.text(((W - tw) / 2, H - 78), tagline, font=tag, fill=GOLD)

    img.save(path, 'PNG', optimize=True)


def generate_images():
    products = db_find('products')
    cats = {c['id']: c['name'] for c in db_find('categories')}
    count = 0
    for p in products:
        cat_id = p.get('category_id', '')
        label = cats.get(cat_id, 'Fresh')
        fname = f"seed_{p['id']}.png"
        fpath = UPLOAD_DIR / fname
        make_product_image(str(fpath), p['name'], label, cat_id)
        data = fpath.read_bytes()
        url = save_upload_bytes('products', fname, data, content_type='image/png')
        db_update('products', {'id': p['id']}, {'images': [url]})
        count += 1
    sync_local_uploads_to_media()
    return count


# ---------------------------------------------------------------------------
# 2. Staff + coupons
# ---------------------------------------------------------------------------

def seed_staff():
    stores = db_find('stores')
    sid = {s['name']: s['id'] for s in stores}
    roster = [
        ('Mohd Zaman', 'Super Admin', '', True, '9820011001'),
        ('Priya Nair', 'Store Manager', sid.get('Andheri', ''), True, '9820011002'),
        ('Rahul Verma', 'Store Manager', sid.get('Kharghar', ''), True, '9820011003'),
        ('Sana Shaikh', 'Store Manager', sid.get('Thane', ''), False, '9820011004'),
        ('Iqbal Khan', 'Inventory Manager', sid.get('Andheri', ''), True, '9820011005'),
        ('Neha Joshi', 'Sales Manager', '', True, '9820011006'),
        ('Arjun Mehta', 'Content Manager', '', False, '9820011007'),
    ]
    added = 0
    for name, role, store_id, on_duty, phone in roster:
        if db_find_one('staff', {'name': name}):
            continue
        db_insert('staff', {
            'id': new_id('stf_'), 'name': name, 'role': role, 'store_id': store_id,
            'phone': phone, 'on_duty': on_duty, 'created_at': app.now_iso(),
        })
        added += 1
    return added


def seed_coupons():
    coupons = [
        ('FAM10', 'percent', 10, 100, 499, True),
        ('FRESH50', 'flat', 50, None, 399, True),
        ('WEEKEND15', 'percent', 15, 150, 799, True),
        ('FIRSTBUY', 'flat', 75, None, 299, True),
        ('BULK20', 'percent', 20, 300, 1499, False),
    ]
    added = 0
    for code, ctype, value, maxd, minsub, active in coupons:
        if db_find_one('coupons', {'code': code}):
            continue
        db_insert('coupons', {
            'id': new_id('cpn_'), 'code': code, 'type': ctype, 'value': value,
            'max_discount': maxd, 'min_subtotal': minsub,
            'expires_at': (datetime.utcnow() + timedelta(days=120)).strftime('%Y-%m-%d'),
            'active': active, 'created_at': app.now_iso(),
        })
        added += 1
    return added


# ---------------------------------------------------------------------------
# 3. Customers + orders across the last 12 months
# ---------------------------------------------------------------------------

FIRST = ['Riya', 'Amit', 'Sneha', 'Rahul', 'Pooja', 'Vikram', 'Anjali', 'Karan', 'Divya', 'Rohit',
         'Meera', 'Sahil', 'Nisha', 'Aditya', 'Kavya', 'Farhan', 'Tanvi', 'Yash', 'Isha', 'Omkar',
         'Sana', 'Zaid', 'Ritu', 'Nikhil', 'Preeti', 'Arjun', 'Sakshi', 'Manav', 'Gauri', 'Dev']
LAST = ['Sharma', 'Patil', 'Desai', 'Verma', 'Nair', 'Shaikh', 'Joshi', 'Mehta', 'Kulkarni', 'Iyer',
        'Khan', 'Gupta', 'Reddy', 'Rao', 'Kapoor', 'Chauhan', 'Bose', 'Pillai', 'Naik', 'Sinha']
AREAS = {
    'store_andheri': ['Lokhandwala, Andheri West', 'Versova, Andheri', '4 Bungalows, Andheri'],
    'store_kharghar': ['Sector 12, Kharghar', 'Sector 20, Kharghar', 'Central Park, Kharghar'],
    'store_thane': ['Ghodbunder Road, Thane', 'Vartak Nagar, Thane', 'Majiwada, Thane'],
}
STATUS_WEIGHTS = [
    ('delivered', 68), ('cancelled', 8), ('out_for_delivery', 7),
    ('ready', 6), ('confirmed', 7), ('new', 4),
]
CHANNELS = [('website', 55), ('store', 20), ('whatsapp', 15), ('phone', 10)]


def _weighted(pairs):
    total = sum(w for _, w in pairs)
    r = random.uniform(0, total)
    upto = 0
    for val, w in pairs:
        upto += w
        if r <= upto:
            return val
    return pairs[-1][0]


def clear_demo():
    """Remove previously generated demo customers/orders (tagged demo=True)."""
    if app._use_mongo:
        app._mongo_db.customers.delete_many({'demo': True})
        app._mongo_db.orders.delete_many({'demo': True})
    else:
        for coll in ('customers', 'orders'):
            rows = [r for r in app._load_local(coll) if not r.get('demo')]
            app._save_local(coll, rows)


def seed_customers_orders(n_customers=80, n_orders=420):
    clear_demo()
    stores = db_find('stores')
    store_ids = [s['id'] for s in stores]
    store_names = {s['id']: s['name'] for s in stores}
    products = db_find('products')
    settings = app.get_settings()

    # Build a price lookup: (store_id, product_id, variant_id) -> (price, name)
    inv_rows = db_find('inventory')
    inv_lookup = {}
    for i in inv_rows:
        inv_lookup.setdefault((i['store_id'], i['product_id']), []).append(i)
    prod_by_id = {p['id']: p for p in products}

    now = datetime.utcnow()

    # Customers spread across the last 360 days
    customers = []
    used_phones = set(c.get('phone') for c in db_find('customers'))
    for i in range(n_customers):
        while True:
            phone = '9' + ''.join(random.choice('0123456789') for _ in range(9))
            if phone not in used_phones:
                used_phones.add(phone)
                break
        home_store = random.choice(store_ids)
        name = f'{random.choice(FIRST)} {random.choice(LAST)}'
        created = now - timedelta(days=random.randint(0, 360), hours=random.randint(0, 23))
        cust = {
            'id': new_id('cust_'), 'name': name, 'phone': phone,
            'email': f'{name.split()[0].lower()}{random.randint(1, 999)}@example.com',
            'address': random.choice(AREAS[home_store]),
            'home_store': home_store, 'demo': True,
            'created_at': created.strftime('%Y-%m-%dT%H:%M:%SZ'),
        }
        customers.append(cust)
    _bulk_insert('customers', customers)

    # Orders — weighted toward recent months for a realistic growth curve
    orders = []
    seq = 2000
    for _ in range(n_orders):
        cust = random.choice(customers)
        store_id = cust['home_store'] if random.random() < 0.8 else random.choice(store_ids)
        # bias days_ago toward smaller numbers (recent) with sqrt distribution
        days_ago = int((random.random() ** 1.7) * 360)
        cust_created_days = (now - datetime.strptime(cust['created_at'], '%Y-%m-%dT%H:%M:%SZ')).days
        days_ago = min(days_ago, max(0, cust_created_days))
        created = now - timedelta(days=days_ago, hours=random.randint(6, 22), minutes=random.randint(0, 59))

        # 1-4 line items
        lines = []
        subtotal = 0
        for _ in range(random.randint(1, 4)):
            p = random.choice(products)
            invs = inv_lookup.get((store_id, p['id']))
            if not invs:
                continue
            inv = random.choice(invs)
            qty = random.randint(1, 3)
            price = inv['price']
            lines.append({
                'product_id': p['id'], 'variant_id': inv['variant_id'],
                'name': p['name'], 'qty': qty, 'price': price,
                'gst_percent': p.get('gst_percent', 0), 'line_total': price * qty,
            })
            subtotal += price * qty
        if not lines:
            continue

        delivery_mode = 'pickup' if random.random() < 0.18 else 'delivery'
        if delivery_mode == 'pickup':
            delivery = 0
        else:
            delivery = 0 if subtotal >= float(settings['free_delivery_above']) else float(settings['delivery_fee_below_min'])

        discount = 0
        coupon_code = ''
        if random.random() < 0.22 and subtotal >= 499:
            coupon_code = 'FAM10'
            discount = round(min(subtotal * 0.10, subtotal), 2)

        total = max(0, subtotal - discount) + delivery
        status = _weighted(STATUS_WEIGHTS)
        seq += 1
        oid = f"ORD{created.strftime('%y%m%d')}{seq}"
        deducted = status in ('confirmed', 'ready', 'out_for_delivery', 'delivered')
        orders.append({
            'id': new_id('ord_'), 'order_id': oid,
            'customer_id': cust['id'], 'customer_phone': cust['phone'],
            'customer_name': cust['name'], 'store_id': store_id,
            'items': lines, 'subtotal': subtotal, 'delivery_fee': delivery,
            'coupon_code': coupon_code, 'discount': discount, 'gst_amount': 0,
            'total': total, 'status': status, 'inventory_deducted': deducted,
            'payment_method': 'cod', 'delivery_mode': delivery_mode,
            'channel': _weighted(CHANNELS),
            'address': '' if delivery_mode == 'pickup' else cust['address'],
            'area': store_names.get(store_id, ''), 'pincode': '',
            'notes': '', 'special_instructions': '', 'demo': True,
            'created_at': created.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'updated_at': created.strftime('%Y-%m-%dT%H:%M:%SZ'),
        })
    _bulk_insert('orders', orders)
    return len(customers), len(orders)


def _bulk_insert(collection, docs):
    if not docs:
        return
    if app._use_mongo:
        app._mongo_db[collection].insert_many([{k: v for k, v in d.items() if k != '_id'} for d in docs])
    else:
        rows = app._load_local(collection)
        rows.extend(docs)
        app._save_local(collection, rows)


if __name__ == '__main__':
    print(f'[seed] DB mode: {db_mode()}')
    print(f'[seed] Base counts — stores={db_count("stores")} products={db_count("products")} '
          f'categories={db_count("categories")}')

    imgs = generate_images()
    print(f'[seed] Generated + attached {imgs} product images')

    staff_added = seed_staff()
    coupons_added = seed_coupons()
    print(f'[seed] Staff added: {staff_added} · Coupons added: {coupons_added}')

    nc, no = seed_customers_orders()
    print(f'[seed] Inserted {nc} demo customers and {no} demo orders')

    print(f'[seed] Totals now — customers={db_count("customers")} orders={db_count("orders")} '
          f'staff={db_count("staff")} coupons={db_count("coupons")}')
    print('[seed] DONE')
