# Pramaan — Website API Reference

This documents **every API the original PHP website called**. These are the
**legacy endpoints** (payment / purchase / contact / coupons / tracking) — the
ones currently being reworked. The Next.js port does **not** call any of them
yet; this file is the spec to wire the new ones against.

> Request/response shapes below are derived from how the frontend **sent** and
> **consumed** the data (`index.php`, `js/script.js`). Field names are exact;
> response fields marked _(inferred)_ are reconstructed from how the JS reads
> the response, since the backend source isn't in this repo.

---

## 1. Architecture

The browser never called `gadgetguruz.com` directly. All calls went through a
same-origin PHP proxy to avoid CORS:

```
Browser ──▶ /api-proxy.php?endpoint=<path> ──▶ https://gadgetguruz.com/api/<path>
                  (same origin)                          (upstream API)
```

- **Proxy file:** `api-proxy.php` (repo root)
- **Upstream base URL:** `https://gadgetguruz.com/api/` (`API_BASE_URL` in `.env`)
- The proxy forwards the method, body, and content-type verbatim, adds
  `Accept: application/json`, and returns the upstream status + body unchanged.
- CORS is wide open on the proxy (`Access-Control-Allow-Origin: *`).

**Endpoint forms used in the site:**

| Friendly name | Proxy URL (what the browser hits) | Upstream URL |
| --- | --- | --- |
| Contact | `api-proxy.php?endpoint=pramaan/contact` | `POST /api/pramaan/contact` |
| Track visit | `api-proxy.php?endpoint=pramaan/track-visit` | `POST /api/pramaan/track-visit` |
| Active coupons | `api-proxy.php?endpoint=pramaan/active-coupons` | `GET /api/pramaan/active-coupons` |
| Validate coupon | `api-proxy.php?endpoint=pramaan/validate-coupon` | `POST /api/pramaan/validate-coupon` |
| Payment | `api-proxy.php?endpoint=pramaan/payment` | `POST /api/pramaan/payment` |
| Download installer | _(direct, no proxy)_ | `GET /api/pramaan/download` |

> Note: `PROXY-IMPLEMENTATION.md` mentions `endpoint=get-coupons`, but the
> shipped `js/script.js` actually calls `pramaan/active-coupons`. The latter is
> authoritative.

---

## 2. Endpoints

### 2.1 Contact / Partnership enquiry

Submits the "Start Testing Devices with Pramaan" form on the home page.

- **Browser:** `POST api-proxy.php?endpoint=pramaan/contact`
- **Upstream:** `POST https://gadgetguruz.com/api/pramaan/contact`
- **Content-Type:** `application/x-www-form-urlencoded` (jQuery `$.ajax` default)
- **Used in:** `index.php` (`#carrerForm` submit handler)

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | |
| `company_name` | string | yes | |
| `phone_no` | string | yes | 10–11 digits, validated client-side |
| `email_id` | string | yes | email format, validated client-side |
| `service` | string | yes | always `PRAMAAN` (readonly field) |
| `description` | string | no | max 250 chars; links/scripts rejected client-side |
| `g-recaptcha-response` | string | yes | Google reCAPTCHA v2 token |

**Example**

```bash
curl -X POST "https://pramaan.gadgetguruz.com/api-proxy.php?endpoint=pramaan/contact" \
  -d "name=John Doe" \
  -d "company_name=Acme Inc" \
  -d "phone_no=9876543210" \
  -d "email_id=john@acme.com" \
  -d "service=PRAMAAN" \
  -d "description=Interested in enterprise diagnostics" \
  -d "g-recaptcha-response=<token>"
```

**Response** _(inferred from `success`/`message`/`errors` handling)_

```jsonc
// 200 OK
{ "success": true, "message": "Your enquiry has been submitted." }

// validation error
{
  "success": false,
  "message": "Validation failed",
  "errors": { "email_id": ["The email field is invalid."] }
}
```

---

### 2.2 Track landing-page visit

Fire-and-forget analytics ping, sent only when `?userId=` or `?source=` is
present in the landing URL.

- **Browser:** `POST api-proxy.php?endpoint=pramaan/track-visit`
- **Upstream:** `POST https://gadgetguruz.com/api/pramaan/track-visit`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Used in:** `index.php` (only if `$userId` or `$source` set)

**Request body**

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | string | from `?userId=` query param |
| `source` | string | from `?source=` query param |

**Example**

```bash
curl -X POST "https://pramaan.gadgetguruz.com/api-proxy.php?endpoint=pramaan/track-visit" \
  -d "userId=abc123" -d "source=email_campaign"
```

**Response** — ignored by the frontend (silent success/failure).

---

### 2.3 Get active coupons

Loads available coupons to display inside the "Buy Now" modal.

- **Browser:** `GET api-proxy.php?endpoint=pramaan/active-coupons`
- **Upstream:** `GET https://gadgetguruz.com/api/pramaan/active-coupons`
- **Headers:** `Accept: application/json`
- **Used in:** `js/script.js` → `loadAvailableCoupons()`

**Request** — no body / no params.

**Response** _(fields read by the frontend)_

```jsonc
// 200 OK
{
  "coupons": [
    { "id": 1, "code": "SAVE10", "type": "percentage", "value": 10 },
    { "id": 2, "code": "FLAT50",  "type": "fixed",      "value": 50 }
  ]
}
```

- `type` is `"percentage"` or a fixed type; the UI renders `"{value}% OFF"` for
  percentage, else `"{currencySymbol}{value} OFF"`.
- An empty/missing `coupons` array hides the coupon list.

---

### 2.4 Validate coupon

Validates a coupon against the cart subtotal.

- **Browser:** `POST api-proxy.php?endpoint=pramaan/validate-coupon`
- **Upstream:** `POST https://gadgetguruz.com/api/pramaan/validate-coupon`
- **Content-Type:** `application/json`
- **Used in:** `js/script.js` → "Apply" coupon button

**Request body (JSON)**

| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | coupon code entered by the user |
| `cart_total` | number | current subtotal (qty × unit price), integer |

**Example**

```bash
curl -X POST "https://pramaan.gadgetguruz.com/api-proxy.php?endpoint=pramaan/validate-coupon" \
  -H "Content-Type: application/json" \
  -d '{"code":"SAVE10","cart_total":499}'
```

**Response** _(fields read by the frontend)_

```jsonc
// valid
{
  "valid": true,
  "coupon": { "id": 1, "code": "SAVE10", "type": "percentage", "value": 10 },
  "discounted_total": 449        // used for fixed-type discounts
}

// invalid
{ "valid": false, "message": "Coupon expired or not applicable" }
```

- For `type: "percentage"`, the UI computes the discount itself from `value`.
- For fixed coupons, the UI derives the discount as
  `qty × unitPrice − discounted_total`.

---

### 2.5 Create / verify payment

Called **after** a successful Razorpay checkout to verify the payment and
provision the license. Two variants exist (lifetime "Buy Now" and "1-month"),
both hitting the same endpoint.

- **Browser:** `POST api-proxy.php?endpoint=pramaan/payment`
- **Upstream:** `POST https://gadgetguruz.com/api/pramaan/payment`
- **Content-Type:** `multipart/form-data` (`FormData`)
- **Headers:** `X-Requested-With: XMLHttpRequest`, `Accept: application/json`
- **Used in:** `js/script.js` → `makePayment` (lifetime) and `makeMonthlyPayment` (monthly), inside the Razorpay `handler` callback

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `razorpay_payment_id` | string | yes | from Razorpay checkout response |
| `name` | string | yes | |
| `phone` | string | yes | |
| `email` | string | yes | |
| `company_name` | string | monthly only | sent by the monthly flow |
| `password` | string | yes | hardcoded `"123456"` in the legacy JS |
| `quantity` | number | yes | |
| `amount` | number | yes | **original** amount (qty × unit price), pre-discount |
| `_token` | string | yes | CSRF token; legacy value `"dummy-token"` |
| `coupon_id` | string | no | only if a coupon was applied (lifetime flow) |
| `coupon_code` | string | no | only if a coupon was applied |
| `discount_amount` | number | no | only if a coupon was applied |

**Example**

```bash
curl -X POST "https://pramaan.gadgetguruz.com/api-proxy.php?endpoint=pramaan/payment" \
  -H "X-Requested-With: XMLHttpRequest" \
  -F "razorpay_payment_id=pay_XXXXXXXX" \
  -F "name=John Doe" \
  -F "phone=9876543210" \
  -F "email=john@acme.com" \
  -F "password=123456" \
  -F "quantity=1" \
  -F "amount=499" \
  -F "_token=dummy-token" \
  -F "coupon_code=SAVE10" \
  -F "coupon_id=1" \
  -F "discount_amount=50"
```

**Response** _(fields read by the frontend)_

```jsonc
// success → frontend then redirects to the download URL
{ "success": true, "message": "Payment verified. License issued." }

// failure
{ "success": false, "message": "Payment verification failed" }
// or
{ "success": false, "error": "Signature mismatch" }
```

The frontend requires the response `Content-Type` to include
`application/json`; anything else is treated as an error.

---

### 2.6 Download installer

Direct download of the Pramaan installer. **Not proxied** — used as a plain
link/redirect.

- **URL:** `GET https://gadgetguruz.com/api/pramaan/download` (`DOWNLOAD_URL`)
- **Used in:** banner & certification "Download now" buttons, Free-Trial pricing
  CTA, and the post-payment auto-download.
- **Response:** the installer binary (`Pramaan_Setup_1.0.0.2.exe`,
  `INSTALLER_FILENAME`).

---

## 3. Third-party integrations (client-side)

### 3.1 Razorpay Checkout

- **Script:** `https://checkout.razorpay.com/v1/checkout.js`
- **Key:** `RAZORPAY_KEY_ID` (legacy live key `rzp_live_yjPy9kI9ELMHSa`)
- **Flow:** `new Razorpay(options).open()` opens the checkout. On success, its
  `handler(response)` receives `razorpay_payment_id`, which is forwarded to
  [§2.5 Payment](#25-create--verify-payment).
- **Options used:** `key`, `amount` (in paise = `amount × 100`), `currency`
  (`INR`), `name`, `description`, `handler`, `prefill.{name,email}`,
  `theme.color = #8B3C96`.

### 3.2 Google reCAPTCHA v2

- **Script:** `https://www.google.com/recaptcha/api.js`
- **Site key:** `RECAPTCHA_SITE_KEY`
  (`6LeKW08qAAAAAHkA-E_i5woIOOZp_-0OOhALVz2n`)
- **Flow:** the widget renders in the contact form; its token is sent as
  `g-recaptcha-response` to [§2.1 Contact](#21-contact--partnership-enquiry).

---

## 4. Configuration values (from `.env`)

| Variable | Legacy value | Used by |
| --- | --- | --- |
| `API_BASE_URL` | `https://gadgetguruz.com/api` | proxy upstream base |
| `DOWNLOAD_URL` | `https://gadgetguruz.com/api/pramaan/download` | installer download |
| `INSTALLER_FILENAME` | `Pramaan_Setup_1.0.0.2.exe` | download filename |
| `RAZORPAY_KEY_ID` | `rzp_live_yjPy9kI9ELMHSa` | Razorpay checkout |
| `RAZORPAY_KEY_SECRET` | _(server only)_ | payment verification (upstream) |
| `RECAPTCHA_SITE_KEY` | `6LeKW08qAAAAAHkA-E_i5woIOOZp_-0OOhALVz2n` | contact form |
| `RECAPTCHA_SECRET_KEY` | _(server only)_ | contact verification (upstream) |
| `PRICE_PER_UNIT` | `499` | lifetime price |
| _(hardcoded)_ | `49` | monthly price (`monthlyPricePerUnit` in JS) |
| `CURRENCY` | `INR` | Razorpay currency |
| `CURRENCY_SYMBOL` | `₹` | price display |

---

## 5. Endpoint summary

| # | Method | Endpoint (upstream) | Content-Type | Purpose |
| --- | --- | --- | --- | --- |
| 2.1 | POST | `/api/pramaan/contact` | form-urlencoded | Contact / partnership form |
| 2.2 | POST | `/api/pramaan/track-visit` | form-urlencoded | Visit analytics ping |
| 2.3 | GET | `/api/pramaan/active-coupons` | — | List active coupons |
| 2.4 | POST | `/api/pramaan/validate-coupon` | JSON | Validate a coupon |
| 2.5 | POST | `/api/pramaan/payment` | multipart/form-data | Verify payment, issue license |
| 2.6 | GET | `/api/pramaan/download` | — | Download installer |

---

## 6. Status in the Next.js port

None of these are wired up in `web/` yet (backend is being reworked). The UI
hooks are stubbed and marked with `NOTE:` comments here:

- Contact → `web/src/components/ContactForm.tsx`
- Payment / coupons → `web/src/components/PricingSection.tsx`
- Download / config constants → `web/src/data/config.ts`
