"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { config } from "@/data/config";
import { apiUrl, hasApiBase } from "@/lib/api-base";

// Dedicated per-platform checkout page (replaces the old Buy Now popup).
//
// The plan defines which platforms it covers (product_scope) and a bundle of
// per-platform device caps (platform_caps) at a single price. Here the buyer sets
// a device count per platform; pricing is per device, derived from the plan bundle
// (unit = price / sum(caps)). On submit we start a guest checkout — the server
// re-prices authoritatively and mints ONE license key covering the chosen platforms.

interface LivePlan {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  features: string[] | null;
  duration_days: number | null;
  product_scope: string[] | null;
  platform_caps: Record<string, number> | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  windows: "Windows",
  android: "Android",
  ios: "iOS",
  mac: "Mac",
};

// Font Awesome brand icons (loaded globally in layout.tsx).
const PLATFORM_ICONS: Record<string, string> = {
  windows: "fa-brands fa-windows",
  android: "fa-brands fa-android",
  ios: "fa-brands fa-apple",
  mac: "fa-brands fa-apple",
};

const fmt = (cents: number) => `${config.CURRENCY_SYMBOL}${(cents / 100).toLocaleString()}`;

function periodLabel(days: number | null): string {
  if (days == null) return "one-time";
  if (days >= 28 && days <= 31) return "per month";
  if (days >= 360 && days <= 370) return "per year";
  return `every ${days} days`;
}

export default function CheckoutClient() {
  const search = useSearchParams();
  const planId = Number(search.get("planId")) || 0;

  const [plan, setPlan] = useState<LivePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Per-platform device counts keyed by platform id.
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "" });
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount_cents: number } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [showCoupon, setShowCoupon] = useState(false);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load the selected plan from the public catalog.
  useEffect(() => {
    if (!planId) { setLoading(false); setLoadError("No plan selected."); return; }
    if (!hasApiBase()) { setLoading(false); setLoadError("Store checkout is not available right now."); return; }
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(apiUrl("plans"));
        if (!res.ok) throw new Error();
        const data = await res.json();
        const found: LivePlan | undefined = (data?.plans || []).find((p: LivePlan) => p.id === planId);
        if (cancelled) return;
        if (!found) { setLoadError("This plan is no longer available."); return; }
        setPlan(found);
        // Default device counts to the plan's own per-platform caps.
        const scope = found.product_scope && found.product_scope.length ? found.product_scope : ["windows"];
        const caps = found.platform_caps || {};
        const initial: Record<string, number> = {};
        for (const p of scope) initial[p] = Math.max(1, caps[p] ?? 1);
        setCounts(initial);
      } catch {
        if (!cancelled) setLoadError("Could not load the selected plan. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [planId]);

  const scope = useMemo(
    () => (plan?.product_scope && plan.product_scope.length ? plan.product_scope : plan ? ["windows"] : []),
    [plan],
  );

  // Per-device unit price derived from the plan bundle: price / sum(plan caps).
  const baseTotal = useMemo(() => {
    const caps = plan?.platform_caps || {};
    const sum = Object.values(caps).reduce((a, b) => a + b, 0);
    return sum > 0 ? sum : 1;
  }, [plan]);

  const totalDevices = useMemo(
    () => Object.values(counts).reduce((a, b) => a + (b || 0), 0),
    [counts],
  );

  // Mirror the server's pricing exactly: round(price * devices / baseTotal).
  const subtotalCents = plan ? Math.round((plan.price_cents * totalDevices) / baseTotal) : 0;
  const discountCents = coupon?.discount_cents ?? 0;
  const totalCents = Math.max(0, subtotalCents - discountCents);
  const unitCents = plan ? Math.round(plan.price_cents / baseTotal) : 0;

  function setCount(platform: string, next: number) {
    const v = Math.max(0, Math.min(9999, Number.isFinite(next) ? Math.floor(next) : 0));
    setCounts((prev) => ({ ...prev, [platform]: v }));
    // A changed basket invalidates any applied coupon (re-priced on re-apply).
    setCoupon(null);
    setCouponError("");
  }

  // Only send platforms with a positive count.
  const chosenCaps = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [p, n] of Object.entries(counts)) if (n > 0) out[p] = n;
    return out;
  }, [counts]);

  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code || !plan || totalDevices < 1) return;
    setApplyingCoupon(true);
    setCouponError("");
    try {
      const res = await fetch(apiUrl("public/coupon"), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ code, planId: plan.id, platformCaps: chosenCaps }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "Invalid coupon");
      setCoupon({ code: data.code, discount_cents: data.discount_cents });
    } catch (err) {
      setCoupon(null);
      setCouponError(err instanceof Error ? err.message : "Invalid coupon");
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!plan) return;
    const el = e.currentTarget;
    if (!el.checkValidity()) { el.reportValidity(); return; }
    if (totalDevices < 1) { setError("Add at least one device to continue."); return; }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(apiUrl("public/checkout"), {
        method: "POST",
        headers: { "Content-Type": "text/plain" }, // simple request → no CORS preflight
        body: JSON.stringify({
          planId: plan.id,
          name: form.name,
          company_name: form.company,
          email_id: form.email,
          phone_no: form.phone,
          platformCaps: chosenCaps,
          couponCode: coupon?.code || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false || !data?.redirectUrl) {
        throw new Error(data?.error || "Could not start checkout.");
      }
      window.location.href = data.redirectUrl; // off to the payment gateway
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return <section className="checkout-section"><div className="container"><div className="checkout-loading">Loading checkout…</div></div></section>;
  }

  if (loadError || !plan) {
    return (
      <section className="checkout-section">
        <div className="container">
          <div className="checkout-empty">
            <h1>Checkout unavailable</h1>
            <p>{loadError || "Plan not found."}</p>
            <Link href="/#pricing" className="btn-primary">Back to pricing</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout-section">
      <div className="container">
        <Link href="/#pricing" className="checkout-back">
          <i className="fas fa-arrow-left"></i> Back to plans
        </Link>

        <div className="checkout-head">
          <div className="checkout-badge"><i className="fas fa-lock"></i> Secure Checkout</div>
          <h1 className="checkout-title">Buy {plan.name}</h1>
          {plan.description ? <p className="checkout-subtitle">{plan.description}</p> : null}
        </div>

        <form onSubmit={submit}>
          <div className="row g-4">
            {/* Left: selection + details */}
            <div className="col-lg-7">
              <div className="checkout-card">
                <h3 className="checkout-card-title">Choose platforms &amp; devices</h3>
                <p className="checkout-card-hint">
                  {fmt(unitCents)} per device · {periodLabel(plan.duration_days)}. Set how many devices you need on each platform — you receive one license key covering them all.
                </p>

                {scope.map((p) => (
                  <div key={p} className="platform-row">
                    <div className="platform-info">
                      <div className="platform-icon"><i className={PLATFORM_ICONS[p] || "fas fa-desktop"}></i></div>
                      <div>
                        <div className="platform-name">{PLATFORM_LABELS[p] || p}</div>
                        <div className="platform-unit">{fmt(unitCents)} / device</div>
                      </div>
                    </div>
                    <div className="stepper">
                      <button type="button" className="step-btn" aria-label={`Decrease ${p} devices`}
                        onClick={() => setCount(p, (counts[p] || 0) - 1)} disabled={(counts[p] || 0) <= 0}>−</button>
                      <input type="number" className="step-input" min={0} max={9999} value={counts[p] ?? 0}
                        aria-label={`${PLATFORM_LABELS[p] || p} devices`}
                        onChange={(e) => setCount(p, parseInt(e.target.value, 10))} />
                      <button type="button" className="step-btn" aria-label={`Increase ${p} devices`}
                        onClick={() => setCount(p, (counts[p] || 0) + 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="checkout-card">
                <h3 className="checkout-card-title">Your details</h3>
                <p className="checkout-card-hint">We&apos;ll email your license key and account login after payment.</p>

                <div className="checkout-field">
                  <label className="checkout-label">Full name *</label>
                  <input className="checkout-input" placeholder="Jane Doe" required
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="checkout-field">
                  <label className="checkout-label">Company name</label>
                  <input className="checkout-input" placeholder="Acme Inc. (optional)"
                    value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                </div>
                <div className="row">
                  <div className="col-sm-6 checkout-field">
                    <label className="checkout-label">Email *</label>
                    <input type="email" className="checkout-input" placeholder="you@company.com" required
                      value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="col-sm-6 checkout-field">
                    <label className="checkout-label">Phone</label>
                    <input type="tel" className="checkout-input" placeholder="10-digit number"
                      pattern="[0-9]{10,11}" title="Please enter a valid phone number (10-11 digits)"
                      value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: order summary */}
            <div className="col-lg-5">
              <div className="summary-card">
                <div className="summary-head">
                  <div className="summary-plan-icon"><i className="fas fa-shield-halved"></i></div>
                  <div>
                    <h3 className="summary-card-title">Order summary</h3>
                    <p className="summary-plan">{plan.name} · {periodLabel(plan.duration_days)}</p>
                  </div>
                </div>

                <div className="summary-items">
                  {totalDevices < 1 ? (
                    <div className="summary-item"><span className="qty">No devices selected</span></div>
                  ) : (
                    scope.filter((p) => (counts[p] || 0) > 0).map((p) => (
                      <div key={p} className="summary-item">
                        <span className="qty">{PLATFORM_LABELS[p] || p} × {counts[p]}</span>
                        <span>{fmt(unitCents * (counts[p] || 0))}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="coupon-wrap">
                  {coupon ? (
                    <div className="coupon-applied">
                      <span><i className="fas fa-tag"></i> <b>{coupon.code}</b> · −{fmt(coupon.discount_cents)}</span>
                      <button type="button" className="coupon-remove" onClick={() => { setCoupon(null); setCouponCode(""); setShowCoupon(false); }}>Remove</button>
                    </div>
                  ) : !showCoupon ? (
                    <button type="button" className="coupon-toggle" onClick={() => setShowCoupon(true)}>
                      <i className="fas fa-tag"></i> Have a coupon code?
                    </button>
                  ) : (
                    <div className="coupon-inline">
                      <input className="coupon-input" placeholder="Coupon code" autoFocus value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())} />
                      <button type="button" className="coupon-apply" onClick={applyCoupon}
                        disabled={applyingCoupon || !couponCode.trim() || totalDevices < 1}>
                        {applyingCoupon ? "…" : "Apply"}
                      </button>
                    </div>
                  )}
                  {couponError ? <div className="field-error">{couponError}</div> : null}
                </div>

                <div className="summary-totals">
                  <div className="total-line">
                    <span>Subtotal ({totalDevices} device{totalDevices === 1 ? "" : "s"})</span>
                    <span>{fmt(subtotalCents)}</span>
                  </div>
                  {coupon ? (
                    <div className="total-line discount"><span>Discount</span><span>−{fmt(discountCents)}</span></div>
                  ) : null}
                  <div className="total-grand">
                    <span className="label">Total</span>
                    <span className="value">{fmt(totalCents)}</span>
                  </div>
                </div>

                <button type="submit" className="pay-btn" disabled={submitting || totalDevices < 1}>
                  {submitting ? "Redirecting…" : <><i className="fas fa-lock"></i> Pay {fmt(totalCents)} securely</>}
                </button>

                <div className="secure-row">
                  <span className="secure-item"><i className="fas fa-lock"></i> SSL secured</span>
                  <span className="secure-item"><i className="fas fa-bolt"></i> Instant delivery</span>
                  <span className="secure-item"><i className="fas fa-envelope"></i> Key emailed</span>
                </div>

                {error ? <div className="checkout-error">{error}</div> : null}
              </div>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
