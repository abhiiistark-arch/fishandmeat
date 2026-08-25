# Fish and Meat — Dev Handoff

**Repo:** https://github.com/abhiiistark-arch/fishandmeat  
**Branch:** `main`

---

## Deploy

```bash
git pull origin main
sudo systemctl restart gunicorn
```

After deploy, hard-refresh admin + website (`Ctrl+Shift+R`) so new JS/CSS loads.

---

## 1. Top offer strip — now admin-configurable

### Use case
Client wants festival offers (e.g. **Eid**) without asking for a code deploy every time. Admin should turn the yellow top banner **on/off**, change message, code, and button text.

### What was already there
- Hardcoded welcome strip (`WELCOME20` / “first order” text) on the website
- Coupons admin (create codes separately)
- Storefront Content CMS for homepage sections

### What was deployed / problem solved
| Problem | Fix |
|--------|-----|
| Offer text locked in code | **Admin → Storefront Content → Top Offer Strip** |
| Need deploy for Eid / festival copy | Save in admin → live on website |
| Cannot hide banner | **Visible: On / Off** |
| Code / CTA fixed | Editable: message, highlight, coupon code, button, dismiss X |

**Fields admin can edit:**
- Visible (On/Off)
- Offer Message
- Highlight Phrase (shown in red)
- Coupon Code (blank = hide code pill)
- Code Label / Button Text
- Allow Dismiss (X)

**Eid example:**
1. Admin → Coupons → create `EID15` (or any code) with discount rules  
2. Admin → Storefront Content → Top Offer Strip → set message + code `EID15` → Save  
3. Website shows new offer immediately  

**Note:** Strip text and coupon rules are separate. Changing the banner does **not** auto-create a coupon — create/edit coupon under **Coupons**.

**Check:** Change message in Storefront Content → Save → open website → new text/code shows. Set Visible Off → strip hidden.

---

## 2. First-order coupon rules

### Use case
`WELCOME20` (or any coupon marked first-order only) should work only for a customer’s **first** order.

### What was already there
- Coupon validate + apply at checkout
- No first-order phone check

### What was deployed / problem solved
| Problem | Fix |
|--------|-----|
| “First order” only on banner text | Server checks prior orders by phone / customer |
| Repeat customers reusing welcome code | Rejected: “only for your first order” |
| Admin cannot mark other coupons the same way | Coupons form has **First order only** checkbox |

**Check:** New phone + `WELCOME20` OK; same phone second order rejected.

---

## 3. In-store billing — phone autofill

### Use case
Staff types returning customer’s **10-digit mobile** → name fills automatically.

### What was already there
- Phone/name saved on POS bill into MongoDB
- No lookup while typing

### What was deployed / problem solved
| Problem | Fix |
|--------|-----|
| Phone saved but not reused | Lookup after **10 digits** → fill name |
| Overwriting staff-typed name | Name field already filled → **no override** |
| Overwriting DB name on repeat bill | Existing customer name in DB **not** overwritten |
| Website vs POS split profiles | Same 10-digit phone = **one** customer |

**Check:** In-Store Billing → known phone → name autofills + “Returning customer” hint.

---

## 4. Related earlier fixes (also on `main`)

| Problem | Fix |
|--------|-----|
| View Bill error / old PDF | Thermal receipt; Jinja `items` crash fixed |
| Rate + Amount stuck on receipt | Column spacing on 80mm bill |
| Print Bill not working | Thermal print via receipt API |
| Wrong order time | Admin lists show **IST** |
| Slow order delete | Stock restore without heavy QR sync |
| Cart “undefined” on back/forward | Cart keeps name/price snapshot |

---

## Quick test checklist

1. `git pull` + restart gunicorn  
2. Admin → Storefront Content → Top Offer Strip → change to Eid text → Save → website updates  
3. Turn strip Off → website hides it  
4. Checkout: first-order coupon OK for new phone; blocked for old phone  
5. In-Store Billing: 10-digit known phone → name autofills  
6. Print / View Bill on a recent POS bill  

---

## Notes

- Promo dismiss is per browser session; changing offer code/message shows the strip again.
- Matching discount still needs a coupon under **Coupons** with the same code.
