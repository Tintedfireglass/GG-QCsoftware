# Pramaan — Next.js frontend

A Next.js (App Router + TypeScript) port of the original PHP marketing site for
**Pramaan**, Gadget Guruz's device health diagnostics & certification software.

This is a **frontend-only** conversion. The original payment (Razorpay), coupon,
contact-form, and visit-tracking APIs are intentionally **not** implemented —
those backend APIs are being reworked. The UI for those flows is preserved:

- **Contact form** renders and validates client-side, but submission shows a
  placeholder notice instead of POSTing. Wire the new endpoint into
  [`ContactForm`](src/components/ContactForm.tsx).
- **Pricing "Buy Now" buttons** render exactly as before but show a placeholder
  notice instead of opening the Razorpay modal. See
  [`PricingSection`](src/components/PricingSection.tsx).

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # production build
npm run start    # serve the production build
```

## Structure

| Path | Purpose |
| --- | --- |
| `src/app/layout.tsx` | Root layout, global metadata, Bootstrap + Font Awesome + `style.css` |
| `src/app/page.tsx` | Home page (`/`) |
| `src/app/faq/` | FAQ page (`/faq`) |
| `src/app/terms-conditions/` | Terms & Conditions |
| `src/app/eula/` | End User License Agreement |
| `src/app/enterprise-license/` | Enterprise License Agreement |
| `src/app/privacy-policy/` | Privacy Policy (scoped styles under `.pp-page`) |
| `src/components/` | Header, HeaderInternal, Footer, FaqAccordion, ContactForm, PricingSection |
| `src/data/content.ts` | All page content (ported 1:1 from `content.php`) |
| `src/data/config.ts` | Static config constants (ported from `.env` defaults) |
| `public/assets/` | Images and video (copied from the original `assets/`) |

## Route mapping (old → new)

| PHP | Next.js |
| --- | --- |
| `index.php` | `/` |
| `faq.php` | `/faq` |
| `terms-conditions.php` | `/terms-conditions` |
| `eula.php` | `/eula` |
| `enterprise-license.php` | `/enterprise-license` |
| `privacy-policy.php` | `/privacy-policy` |

Styling and markup mirror the original Bootstrap 5 layout; the custom
`css/style.css` is reused verbatim as `src/app/style.css`. Interactive bits
(mobile menu, FAQ accordion) are handled with React state instead of Bootstrap's
JS bundle.
