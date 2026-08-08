# Mobile Application — Fish and Meat

Stock + QR + billing app for **Android APK** and **PWA**. Talks to the same Fish and Meat web API / MongoDB as admin.

## Features

1. Staff login (same admin username/password → API token; role-aware)
2. Home sales cards
3. **In-Store Billing** — create customer bill, deduct stock (same as Admin → In-Store)
4. **Inventory & Stock** — view / edit price & stock (Super Admin + Store Admin)
5. **Categories & Products** — browse catalog with live stock by store
6. **Generate & Print QR** — unique **pending** QRs + PDF (stock not increased yet)
7. **Print QR** — reprint selected units
8. **Punch & Stock In** — pending QR → `in_stock` and inventory **+1**

## Will Wi‑Fi + APK login work?

**Yes**, with this flow:

1. Phone installs the APK (or opens the PWA)
2. App asks camera (and network) permissions
3. User enters **Website URL** + admin username/password  
   - Production: `https://your-domain.com`  
   - Local shop server: `http://192.168.x.x:5000` (same Wi‑Fi as the PC/server)
4. App calls `POST /api/mobile/login` on that host
5. After auth, Billing / Inventory / Catalog / QR features hit the same server

### Better options (recommended)

| Approach | When to use |
|----------|-------------|
| **APK + HTTPS production URL** (best) | Live shop — Wi‑Fi or mobile data |
| **PWA** at `/mobile/` | Fastest install; Add to Home Screen |
| **APK + LAN IP** | Local-only server; same Wi‑Fi |
| **APK + editable Server URL** (already in UI) | One APK for staging + production |

---

## Option A — PWA (no Android Studio)

1. Deploy / run the Fish and Meat server
2. Phone browser → `https://YOUR-DOMAIN/mobile/`
3. **Android:** Install app / Add to Home screen  
4. **iPhone Safari:** Share → Add to Home Screen  
5. Login with admin credentials

---

## Option B — Download APK

Built APK path (after build):

- Local file: `static/downloads/FishandMeet-punch.apk`
- Or open on the server: `/download/apk`

Rebuild after `www/` changes:

```bash
cd "Mobile Application FishandMeet"
npx cap sync android
cd android
# set JAVA_HOME to a JDK 17+
.\gradlew.bat assembleDebug
copy app\build\outputs\apk\debug\app-debug.apk ..\..\static\downloads\FishandMeet-punch.apk
copy app\build\outputs\apk\debug\app-debug.apk ..\FishandMeet-punch.apk
```

---

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/mobile/login` | Auth → bearer token |
| GET | `/api/mobile/me` | Session check |
| GET | `/api/mobile/dashboard` | Sales cards |
| GET | `/api/mobile/stores` | Stores |
| GET | `/api/mobile/catalog` | Categories + products |
| GET | `/api/mobile/pos/catalog` | In-stock products for billing |
| GET/POST | `/api/mobile/pos/orders` | Recent bills / create bill (stock out) |
| GET | `/api/mobile/pos/invoice/<order_id>` | Invoice PDF |
| GET/POST | `/api/mobile/inventory` | List / add stock qty |
| PUT | `/api/mobile/inventory/<id>` | Set price & stock |
| GET | `/api/mobile/qr-units` | Units for print |
| POST | `/api/mobile/qr-generate` | Generate pending QRs |
| GET | `/api/mobile/qr-lookup` | Resolve scan (`purpose=punch` or `sale`) |
| POST | `/api/mobile/punch` | Stock in (+1) |
| POST | `/api/mobile/qr-print` | QR PDF |

CORS is enabled for `/api/mobile/*` so the APK origin can call your deployed site.
