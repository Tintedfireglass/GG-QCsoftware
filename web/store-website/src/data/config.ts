// Static configuration (ported from the PHP .env defaults).
// Backend / payment APIs are intentionally out of scope for now, so these are
// plain constants. When the new APIs land, wire them in here.

export const config = {
  APP_NAME: "PRAMAAN",
  APP_URL: "https://pramaan.gadgetguruz.com",
  PRICE_PER_UNIT: 499,
  MONTHLY_PRICE_PER_UNIT: 49,
  CURRENCY: "INR",
  CURRENCY_SYMBOL: "₹",
  DOWNLOAD_URL: "https://gadgetguruz.com/api/pramaan/download",
  INSTALLER_FILENAME: "Pramaan_Setup_1.0.0.2.exe",
  RECAPTCHA_SITE_KEY: "6LeKW08qAAAAAHkA-E_i5woIOOZp_-0OOhALVz2n",
} as const;
