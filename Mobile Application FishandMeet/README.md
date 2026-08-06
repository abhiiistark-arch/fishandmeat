# Mobile Application — Fish and Meat

Stock + QR app for **Android APK** and **PWA** (Android / iPhone). Talks to the same Fish and Meat web API / MongoDB as admin.

## Features (same idea as admin QR Section)

1. Staff login (admin username/password → API token)
2. Home sales cards
3. **Generate & Print QR** — store → category → product → quantity → unique **pending** QRs + PDF (inventory stock **not** increased)
4. **Print QR** — checkbox select pending/in-stock units → PDF reprint
5. **Punch & Stock** — scan **one** pending unit QR → confirm → that unit becomes `in_stock` and inventory **+1**. Already in-stock / sold QRs are rejected.

## Will Wi‑Fi + APK login work?

**Yes**, with this flow:

1. Phone installs the APK (or opens the PWA)
2. App asks camera (and network) permissions
3. User enters **Website URL** + admin username/password  
   - Production: `https://your-domain.com`  
   - Local shop server: `http://192.168.x.x:5000` (same Wi‑Fi as the PC/server)
4. App calls `POST /api/mobile/login` on that host
5. After auth, Generate / Print / Punch all hit the same server over the network

### Better options (recommended)

| Approach | When to use |
|----------|-------------|
| **APK + HTTPS production URL** (best) | Live shop — works on Wi‑Fi **or** mobile data; set `FAM_API_URL` in `www/js/config.js` |
| **PWA** at `/mobile/` | Fastest install, no Play Store; Add to Home Screen |
| **APK + LAN IP** | Offline / local-only server; phone must be on **same Wi‑Fi** as the server |
| **APK + editable Server URL** (already in UI) | One APK for staging + production; staff paste the URL once |

**Tip:** Prefer a public HTTPS domain over raw LAN IP so you don’t depend on Wi‑Fi alone.

---

## Option A — PWA (no Android Studio)

1. Deploy / run the Fish and Meat server
2. Phone browser → `https://YOUR-DOMAIN/mobile/`
3. **Android:** Install app / Add to Home screen  
4. **iPhone Safari:** Share → Add to Home Screen  
5. Login with admin credentials (server URL is auto when opened on same domain)

---

## Option B — Android APK (share `.apk` file)

Requires: Node.js 18+, Android Studio (SDK + JDK), USB debugging or emulator.

### 1. Set production API URL (recommended before build)

Edit `www/js/config.js`:

```js
window.FAM_API_URL = 'https://YOUR-DEPLOYED-DOMAIN.com';
```

If you leave it blank, the APK login screen still lets the user type the website URL.

### 2. Install deps + create Android project

```bash
cd "Mobile Application FishandMeet"
npm install
npx cap add android
npx cap sync android
npx cap open android
```

### 3. Permissions (Android Studio)

After `cap add android`, open `android/app/src/main/AndroidManifest.xml` and ensure:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

For **HTTP LAN** testing (`http://192.168.x.x`), `capacitor.config.json` already has `"cleartext": true`.  
For production HTTPS you don’t need cleartext.

### 4. Build APK

In Android Studio:

1. Wait for Gradle sync  
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
3. Find the APK under `android/app/build/outputs/apk/debug/` (or release if you signed it)  
4. Share that `.apk` with Android users (sideload / internal distribute)

Rebuild after web changes:

```bash
npx cap sync android
# then Build APK again in Android Studio
```

### 5. First run on phone

1. Install APK → allow Install unknown apps if asked  
2. Open app → allow **Camera**  
3. Enter Website URL (if not baked into config) + admin username/password  
4. App authenticates against your server → home / Generate / Print / Punch

---

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/mobile/login` | Auth → bearer token |
| GET | `/api/mobile/me` | Session check |
| GET | `/api/mobile/dashboard` | Sales cards |
| GET | `/api/mobile/stores` | Stores |
| GET | `/api/mobile/catalog` | Categories + products |
| GET | `/api/mobile/qr-units` | In-stock unique QRs for print |
| POST | `/api/mobile/qr-generate` | Generate N unique QRs + stock |
| GET | `/api/mobile/qr-lookup` | Resolve scan |
| POST | `/api/mobile/punch` | Confirm stock add |
| POST | `/api/mobile/qr-print` | Download QR PDF |

CORS is enabled for `/api/mobile/*` so the APK origin can call your deployed site.
