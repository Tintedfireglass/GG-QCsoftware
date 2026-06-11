# PRAMAAN Mobile — API Integration Notes

This document records how the Android app integrates the backend API, and **every place the app differs from `PRAMAAN_Mobile_API.postman_collection.json`** (including endpoints added to the collection during integration). Keep it in sync when the contract changes.
  .. .. 
- **Base URL:** `https://pramaan-dashboard.gadgetguruz.com` — wired via `BuildConfig.BASE_URL` (per build type in `app/build.gradle.kts`), Retrofit appends a trailing `/`.
- **Auth:** phone + OTP → 30-day customer JWT. Stored in DataStore (`core/session/SessionManager`) and attached as `Authorization: Bearer <token>` by `core/network/AuthInterceptor` on every request once logged in.
- **Envelope (mobile API):** success `{ success: true, message?, data? }`, error `{ success: false, error: { code, message, details? } }`. Parsed by `core/network/ApiEnvelope` + `safeApiCall`. Repositories return `AppResult.Success/Error` (`core/result/AppResult`).
- **Exceptions:** `GET /api/updates/android/latest` uses the platform's plain `{ error, message }` shape (handled separately). `GET /api/mobile/legal` uses the standard mobile envelope.

---

## 1. Endpoint inventory & integration status

Legend — **Wired**: called from the UI end-to-end · **Repo only**: data layer exists, no screen calls it yet · **Doc only**: in the Postman collection but no client code.

### Auth
| Endpoint | Method | Status | Where in app |
|---|---|---|---|
| `/api/mobile/auth/request-otp` | POST | **Wired** | Login & Sign-up "Get OTP/Sign Up", and the Resend button |
| `/api/mobile/auth/verify-otp` | POST | **Wired** | Login verify, **and Sign-up** (create-or-login; carries profile fields) |
| `/api/mobile/auth/logout` | POST | **Wired** | Profile → Logout (clears token locally regardless of response) |
| `/api/mobile/auth/resend-otp` | POST | **Doc only** | See §3 — app reuses `request-otp` for resend |
| `/api/mobile/auth/refresh` | POST | **Doc only** | Added to collection; no client code |
| `/api/mobile/auth/me` | GET | **Doc only** | Added to collection; no client code |

### User
| Endpoint | Method | Status | Where in app |
|---|---|---|---|
| `/api/mobile/user/profile` | GET | **Wired** | Profile header (name/email) |
| `/api/mobile/user/profile` | PUT | **Wired** | Profile → header "Edit Profile" dialog (firstName/lastName/email) |
| `/api/mobile/user/account` | DELETE | **Repo only** | `UserRepository.deleteAccount()` exists; no UI entry |

### Device
| Endpoint | Method | Status | Where in app |
|---|---|---|---|
| `/api/mobile/device/info` | POST | **Wired** | Fired once on Home load (`HomeViewModel`), fire-and-forget |

### License
| Endpoint | Method | Status | Where in app |
|---|---|---|---|
| `/api/mobile/license/activate` | POST | **Wired** | Profile → License screen |
| `/api/mobile/license/status` | GET | **Wired** | License screen (loads on open) |

### Reports
| Endpoint | Method | Status | Where in app |
|---|---|---|---|
| `/api/mobile/reports/test/battery` | POST | **Wired** | Battery test (terminal result) |
| `/api/mobile/reports/test/display` | POST | **Wired** | Display test (overall result) |
| `/api/mobile/reports/test/sensors` | POST | **Wired** | Sensors test (aggregated) |
| `/api/mobile/reports/test/single` | POST | **Wired** | 14 single hardware tests (wifi, bluetooth, gps, nfc, camera, microphone, speaker, vibration, volume, power, fingerprint, infrared, charging port, headphone jack) |
| `/api/mobile/reports/basicqc` | POST | **Wired** | **NEW** — standalone "Basic QC Test" (see §3) |
| `/api/mobile/reports/fullqc` | POST | **Wired** | Full Health → QC phase |
| `/api/mobile/reports/stress` | POST | **Wired** | Stress test |
| `/api/mobile/reports/history` | GET | **Wired** | History tab |
| `/api/mobile/reports/{reportId}` | GET | **Wired** | History → tap a row → Report Detail |

### Support
| Endpoint | Method | Status | Where in app |
|---|---|---|---|
| `/api/mobile/support/contact` | POST | **Doc only** | ✅ **Backend live** — Contact Support button not yet wired in app |
| `/api/mobile/support/tickets` | GET | **Doc only** | ✅ **NEW backend** — list the customer's own tickets (paginated); no client code yet |

### Legal
| Endpoint | Method | Status | Where in app |
|---|---|---|---|
| `/api/mobile/legal` | GET | **Wired** | **NEW** — Profile → Terms & Conditions / Privacy Policy (in-app WebView) |

### App Update
| Endpoint | Method | Status | Where in app |
|---|---|---|---|
| `/api/updates/android/latest` | GET | **Repo only** | `AppUpdateRepository` exists; no launch-time check wired |

---

## 2. Endpoints ADDED to the Postman collection during integration

These were **not** in the backend dev's original collection — they were added while building the app and **need backend implementation**:

| Endpoint | Reason |
|---|---|
| `POST /api/mobile/reports/basicqc` | Split Basic QC from Full QC (see §3). **Required** — standalone Basic QC will 404 until implemented. |
| `GET /api/mobile/legal` | Backend-driven Terms & Conditions + Privacy Policy content. **Required** for those Profile items. |
| `POST /api/mobile/auth/resend-otp` | Dedicated resend (rate-limit aware). Optional — app works via `request-otp`. |
| `POST /api/mobile/auth/refresh` | Refresh the 30-day JWT. Not yet used by client. |
| `GET /api/mobile/auth/me` | Validate session / fetch current user. Not yet used by client. |
| `POST /api/mobile/support/contact` | Backs the Support "Contact Support" button. Not yet wired. |
| History `type` filter | Added `BASIC_QC` to the allowed values. |

> Note: a **Google Sign-In** endpoint (`/auth/google`) was briefly added and then **removed** — Google auth is not implemented, and the buttons were removed from Login/Sign-up.

---

## 3. Behavioural differences from the collection

### 3.1 Basic QC vs Full QC — two endpoints, same payload
The app runs one QC sweep screen (`FullQCScreen`) but reports to **two different endpoints** by context:

| App flow | Endpoint | Stored `type` |
|---|---|---|
| Home → **"Basic QC Test"** (standalone sweep) | `POST /reports/basicqc` | `BASIC_QC` |
| **Full Health Test** → QC phase | `POST /reports/fullqc` | `FULL_QC` |

Both send the **identical** `FullQcRequest` body (`deviceId`, `testedAt`, `totalTests`, `passedCount`, `failedCount`, `overallResult`, `testResults` map, optional `deviceSnapshot`). The path is the only difference, so the dashboard can distinguish a quick hardware check from the full health run. **Backend must implement `/reports/basicqc`.**

### 3.2 Per-test report suppression during a QC run
During a Basic QC or Full Health QC sweep, the individual sub-test endpoints (`/reports/test/*`) are **suppressed** — only the single aggregated `basicqc`/`fullqc` report is sent. (Implemented via `FullQcSession`; gated inside `ReportSubmitter`.) Running a test **standalone** submits its individual report as normal. `submitFullQc`/`submitStress` are never suppressed.

### 3.3 Sign-up uses `verify-otp` (no separate endpoint)
There is no signup endpoint; `verify-otp` does "create-or-login by phone" and returns `isNewUser`. The Sign-up screen collects **firstName, lastName, email, phone** and runs the same OTP flow, sending those profile fields on verify.
- **`password` is NOT sent** — the backend is OTP-only; the password field was removed from the UI.
- **`dateOfBirth` is NOT sent** — unused by the app; the DOB field was removed. (The collection's `verify-otp` example still shows `dateOfBirth`; the app simply omits it.)

### 3.4 Resend OTP
The Login/Sign-up "Resend OTP" button currently calls **`request-otp`**, not the dedicated `resend-otp` endpoint (which exists in the collection but isn't wired).

### 3.5 History route ordering (operational)
`GET /reports/history` will **404** if the backend registers `GET /reports/:reportId` before `/reports/history` (the literal `history` gets captured as a report id). Backend must register `/reports/history` **before** the `:reportId` route. The client path is correct and matches the collection.

---

## 4. DTO field assumptions to confirm against live responses

Where the collection didn't specify exact response shapes, DTOs use **nullable fields + `ignoreUnknownKeys`** so they won't crash, but field names are best-effort and should be confirmed/tightened:

| DTO | File | Assumed fields |
|---|---|---|
| `LicenseStatusDto` | `feature/license/data/LicenseDtos.kt` | `active`, `status`, `key`, `productScope`, `activatedAt`, `expiresAt`, `deviceId` |
| `ReportSummaryDto` / `ReportHistoryData` | `feature/reports/data/ReportDtos.kt` | list under `reports`; row: `reportId`, `type`, `overallResult`/`result`, `deviceId`, `testedAt`, `createdAt`; paging: `page`, `limit`, `total`, `totalPages` |
| Report detail | `GET /reports/{id}` | Rendered generically from the raw `data` JSON object — adapts to any shape. |
| `UserProfileDto` | `feature/user/data/UserDtos.kt` | `id`, `firstName`, `lastName`, `phone`, `countryCode`, `email`, `dateOfBirth`, `createdAt`, `updatedAt` |
| `LegalContentDto` | `feature/legal/data/LegalDtos.kt` | `termsContent`, `privacyContent`, `termsUpdatedAt`, `privacyUpdatedAt` |
| `AppUpdateManifest` | `feature/appupdate/data/AppUpdateDtos.kt` | `latestVersion`, `versionCode`, `updateAvailable`, `mandatory`, `downloadUrl`, `releaseNotes`, `channel` |

Submit-report responses assume `data.reportId`. Verify-OTP assumes `data.token` + `data.isNewUser`. Request-OTP reads optional `data.devOtp` (non-prod auto-fill).

---

## 5. Backend TODO checklist

- [ ] Implement `POST /api/mobile/reports/basicqc` (stores `type = BASIC_QC`). **Blocks standalone Basic QC reporting.**
- [ ] Implement `GET /api/mobile/legal` (`termsContent`, `privacyContent`). **Blocks Terms/Privacy screens.**
- [ ] Ensure `GET /reports/history` is routed **before** `/reports/:reportId` (404 fix).
- [ ] (If desired) Implement `auth/resend-otp`, `auth/refresh`, `auth/me`, `support/contact` — added to the contract, client wiring pending.
- [ ] Confirm response shapes for the DTOs in §4.

---

## 6. Not yet wired on the client (future work)

- `DELETE /user/account` — repo ready, no UI entry.
- `GET /api/updates/android/latest` — repo ready, no launch-time update check.
- `auth/resend-otp`, `auth/refresh`, `auth/me`, `support/contact` — no client code.
