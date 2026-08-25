# Fish and Meat — Dev Handoff

**Repo:** https://github.com/abhiiistark-arch/fishandmeat  
**Branch:** `main`  
**Latest commit:** `a0afe27` (25 Aug 2026)

---

## Deploy

```bash
git pull origin main
sudo systemctl restart gunicorn
```

After deploy, hard-refresh admin + website (`Ctrl+Shift+R`) so new JS/CSS loads.

---

## Changes by date

### 25 Aug 2026 — Configurable top offer strip

**Commit:** `a0afe27`

**Use case**  
Client wants Eid / festival offers without a code deploy every time.

**What was already there**  
Hardcoded welcome banner (`WELCOME20`). Coupons admin existed separately. Storefront Content CMS covered homepage sections only.

**What was deployed / problem solved**

| Problem | Fix |
|--------|-----|
| Offer text locked in code | **Admin → Storefront Content → Top Offer Strip** |
| Need deploy for festival copy | Save in admin → live on website |
| Cannot hide banner | **Visible: On / Off** |
| Code / CTA fixed | Editable message, highlight, coupon code, button, dismiss X |

**How to set an Eid offer**
1. Admin → Coupons → create code e.g. `EID15`  
2. Admin → Storefront Content → Top Offer Strip → message + code → Save  
3. Website shows new offer  

**Note:** Banner text ≠ coupon rules. Create/edit the matching coupon under **Coupons**.

**Check:** Change strip text → Save → website updates. Set Visible Off → strip hidden.

---

### 24 Aug 2026 — Welcome offer + first-order rules + POS phone autofill

**Commit:** `49eecd0`

#### A) Welcome strip + first-order coupon

**Use case**  
Show welcome discount on site; only allow it on a customer’s **first** order.

**What was already there**  
Checkout coupon field. No first-order phone check. No top promo strip.

**What was deployed / problem solved**

| Problem | Fix |
|--------|-----|
| No visible welcome offer | Yellow top promo strip |
| “First order” only text | Server checks prior orders by phone/customer |
| Repeat use of welcome code | Rejected for returning customers |
| Need first-order on other coupons | Coupons form → **First order only** checkbox |
| Coupon missing in DB | `WELCOME20` seeded/synced on boot |

**Check:** New phone + `WELCOME20` OK; same phone second order rejected.

#### B) In-store billing — phone autofill

**Use case**  
Staff types returning customer’s **10-digit mobile** → name fills automatically.

**What was already there**  
Phone/name saved on bill, but no lookup while typing.

**What was deployed / problem solved**

| Problem | Fix |
|--------|-----|
| Phone saved but not reused | Lookup after **10 digits** → fill name |
| Overwriting staff-typed name | Already filled name → **no override** |
| Overwriting DB name on repeat bill | Existing customer name **not** overwritten |
| Website vs POS split profiles | Same 10-digit phone = **one** customer |

**Check:** In-Store Billing → known phone → name autofills + “Returning customer” hint.

---

### 23 Aug 2026 — Faster inventory stock-in

**Commit:** `5a2d1e9`

**Use case**  
Admin stocking inventory should be fast; POS billing must stay untouched.

**What was deployed / problem solved**  
Inventory stock-in made much faster without changing POS billing behaviour.

---

### 21 Aug 2026 — POS billing, receipts, time, cart

**Commits:** `33c02d4`, `9095259`, `ee65aa2`

| Problem | Fix |
|--------|-----|
| Bulk POS cart slow / “Request failed” | Faster checkout; skip heavy QR sync during bill |
| **Print Bill** not working | Thermal print via receipt API |
| PDF / View Bill old or broken | New thermal receipt; Jinja `items` crash fixed |
| Rate + Amount stuck on receipt | Column spacing on 80mm bill |
| Order time not India time | Admin lists show **IST** |
| Order delete slow | Stock restore without heavy QR sync |
| Website cart “undefined” on back/forward | Cart keeps name/price snapshot |

**Check:** Punch a bill → Print / View Bill → time in IST → delete order from Orders (should be quick).

---

### 19 Aug 2026 — Thermal auto-print + storefront extras

**Commit:** `0548807`

| Problem | Fix |
|--------|-----|
| Need thermal receipt on POS | Auto-print / print again for Essae-style 80mm |
| Variant picking UX | Card-style weight picker on storefront |
| Frozen Food GST | 5% GST handling for frozen category |

---

## Quick test checklist (after latest pull)

1. `git pull` + restart gunicorn  
2. **25 Aug:** Storefront Content → Top Offer Strip → Eid text → Save → website updates; Off hides strip  
3. **24 Aug:** First-order coupon OK for new phone; blocked for old phone  
4. **24 Aug:** In-Store Billing → 10-digit known phone → name autofills  
5. **21 Aug:** Print / View Bill; bill time looks like India time  

---

## Notes

- Promo dismiss is per browser session; changing offer code/message shows the strip again.
- Matching discount still needs a coupon under **Coupons** with the same code.
