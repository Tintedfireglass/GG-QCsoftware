"use client";

import { useEffect, useState } from "react";
import { pricing, type PricingPlan } from "@/data/content";
import { config } from "@/data/config";
import { apiUrl } from "@/lib/api-base";

// Pricing section (ported from index.php).
//
// The Basic and Professional cards are driven by the live plans catalog from the
// admin app (plan id 1 → Basic, id 2 → Professional) via /api/plans, so edits in
// the dashboard reflect here. Buying one opens a short checkout form (name,
// company, email, phone) with quantity + coupon; on submit we start a guest
// checkout and redirect to the payment gateway. Credentials + license key are
// emailed on success. Free Trial and Enterprise stay static. If the API is
// unreachable, all cards fall back to their static content.

interface LivePlan {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  features: string[] | null;
  duration_days: number | null;
}

type DisplayPlan = PricingPlan & { planId?: number };

interface CouponPreview {
  code: string;
  discount_cents: number;
  total_cents: number;
}

interface AvailableCoupon {
  code: string;
  label: string;
  description: string | null;
}

function periodLabel(days: number | null): string {
  if (days == null) return "/ lifetime";
  if (days >= 28 && days <= 31) return "/ month";
  if (days >= 360 && days <= 370) return "/ year";
  return `/ ${days} days`;
}

const fmt = (cents: number) => `${config.CURRENCY_SYMBOL}${(cents / 100).toLocaleString()}`;

// Merge a live plan onto a static card, keeping the card's styling (featured/badge).
function toCard(base: PricingPlan, p: LivePlan): DisplayPlan {
  return {
    ...base,
    planId: p.id,
    title: p.name || base.title,
    subtitle: p.description || base.subtitle,
    price: fmt(p.price_cents),
    period: periodLabel(p.duration_days),
    features: p.features && p.features.length > 0 ? p.features : base.features,
    ctaText: "Buy Now",
    ctaModal: undefined,
    ctaLink: undefined,
  };
}

export default function PricingSection({ downloadUrl }: { downloadUrl?: string }) {
  // Free Trial card links to the app download; point it at the live installer
  // URL resolved server-side (falls back to the static one).
  const resolveLink = (link?: string) =>
    link === config.DOWNLOAD_URL ? downloadUrl || config.DOWNLOAD_URL : link;

  const [notice, setNotice] = useState(false);
  const [plans, setPlans] = useState<DisplayPlan[]>(() =>
    pricing.plans.map((p) => ({ ...p, ctaLink: resolveLink(p.ctaLink) })),
  );
  const [livePlans, setLivePlans] = useState<Record<number, LivePlan>>({});

  // Checkout modal state.
  const [targetId, setTargetId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "" });
  const [quantity, setQuantity] = useState(1);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState<AvailableCoupon[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = apiUrl("plans");
    if (!url) return; // no API base configured → keep static content
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const list: LivePlan[] = data?.plans || [];
        if (cancelled || list.length === 0) return;

        const byId = new Map(list.map((p) => [p.id, p]));
        setLivePlans(Object.fromEntries(list.map((p) => [p.id, p])));
        setPlans((prev) =>
          prev.map((card) => {
            if (card.title === "Basic" && byId.has(1)) return toCard(card, byId.get(1)!);
            if (card.title === "Professional" && byId.has(2)) return toCard(card, byId.get(2)!);
            return card;
          }),
        );
      } catch {
        /* keep static content on any failure */
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const targetPlan = targetId != null ? livePlans[targetId] : null;
  const subtotalCents = targetPlan ? targetPlan.price_cents * quantity : 0;
  const totalCents = coupon ? coupon.total_cents : subtotalCents;

  function openCheckout(planId: number) {
    setTargetId(planId);
    setForm({ name: "", company: "", email: "", phone: "" });
    setQuantity(1);
    setCouponCode("");
    setCoupon(null);
    setCouponError("");
    setError("");
    setAvailableCoupons([]);

    // Load coupons the admin chose to advertise for this plan.
    (async () => {
      try {
        const res = await fetch(apiUrl("public/coupons") + `?planId=${planId}`);
        if (!res.ok) return;
        const data = await res.json();
        setAvailableCoupons(data?.coupons || []);
      } catch { /* no chips on failure */ }
    })();
  }

  function changeQuantity(next: number) {
    setQuantity(Math.max(1, Math.min(999, next || 1)));
    setCoupon(null);          // re-validate the coupon against the new quantity
    setCouponError("");
  }

  async function applyCoupon(codeArg?: string) {
    if (targetId == null) return;
    const code = (codeArg ?? couponCode).trim();
    if (!code) return;
    setCouponCode(code);
    setApplyingCoupon(true);
    setCouponError("");
    try {
      const res = await fetch(apiUrl("public/coupon"), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ code, planId: targetId, quantity }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || "Invalid coupon");
      setCoupon({ code: data.code, discount_cents: data.discount_cents, total_cents: data.total_cents });
    } catch (err) {
      setCoupon(null);
      setCouponError(err instanceof Error ? err.message : "Invalid coupon");
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function submitCheckout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (targetId == null) return;
    const el = e.currentTarget;
    if (!el.checkValidity()) { el.reportValidity(); return; }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(apiUrl("public/checkout"), {
        method: "POST",
        headers: { "Content-Type": "text/plain" }, // simple request → no preflight
        body: JSON.stringify({
          planId: targetId,
          name: form.name,
          company_name: form.company,
          email_id: form.email,
          phone_no: form.phone,
          quantity,
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

  return (
    <section className="pricing-section">
      <div className="container">
        <p className="pricing-badge">
          <i className="fas fa-chart-line"></i>
          {pricing.badgeText}
        </p>
        <h2 className="pricing-title">{pricing.title}</h2>

        {notice ? (
          <p className="text-center text-muted" role="status">
            Online purchase is being reconnected to our new payment system and
            will be available shortly.
          </p>
        ) : null}

        <div className="row g-4 justify-content-center">
          {plans.map((plan) => (
            <div className="col-lg-3 col-md-6" key={plan.title}>
              <div
                className={`pricing-card${
                  plan.featured ? " pricing-card-featured" : ""
                }`}
              >
                {plan.featured && plan.badge ? (
                  <div className="pricing-badge-recommended">{plan.badge}</div>
                ) : null}
                <h3 className="pricing-card-title">{plan.title}</h3>
                <p className="pricing-card-subtitle">{plan.subtitle}</p>
                <div className="pricing-card-price">
                  <span className="price-amount">{plan.price}</span>
                  {plan.period ? (
                    <span className="price-period">{plan.period}</span>
                  ) : null}
                </div>
                <ul className="pricing-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <i className="fas fa-check-circle"></i> {feature}
                    </li>
                  ))}
                </ul>
                {plan.planId ? (
                  <button
                    type="button"
                    className={`pricing-btn ${plan.ctaClass}`}
                    onClick={() => openCheckout(plan.planId!)}
                  >
                    {plan.ctaText}
                  </button>
                ) : plan.ctaModal ? (
                  <button
                    type="button"
                    className={`pricing-btn ${plan.ctaClass}`}
                    onClick={() => setNotice(true)}
                  >
                    {plan.ctaText}
                  </button>
                ) : (
                  <a
                    href={plan.ctaLink}
                    className={`pricing-btn ${plan.ctaClass}`}
                  >
                    {plan.ctaText}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Checkout modal */}
      {targetId != null && targetPlan ? (
        <div
          onClick={() => !submitting && setTargetId(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1050,
            background: "rgba(15,23,42,0.55)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: "1rem",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 14, maxWidth: 460, width: "100%", padding: "1.75rem", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".5rem" }}>
              <h4 style={{ margin: 0 }}>Buy {targetPlan.name}</h4>
              <button type="button" onClick={() => !submitting && setTargetId(null)}
                style={{ border: "none", background: "none", fontSize: "1.5rem", lineHeight: 1, cursor: "pointer", color: "#64748b" }}>×</button>
            </div>
            <p style={{ color: "#64748b", fontSize: ".9rem", marginBottom: "1rem" }}>
              Enter your details. We&apos;ll email your license key and account login after payment.
            </p>

            <form onSubmit={submitCheckout} className="career-form">
              <div className="form-group">
                <input className="form-control" placeholder="Name *" required
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <input className="form-control" placeholder="Company Name"
                  value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div className="form-group">
                <input type="email" className="form-control" placeholder="Email *" required
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <input type="tel" className="form-control" placeholder="Phone Number"
                  pattern="[0-9]{10,11}" title="Please enter a valid phone number (10-11 digits)"
                  value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>

              {/* Quantity */}
              <div className="form-group" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <label style={{ margin: 0, color: "#334155" }}>Quantity</label>
                <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                  <button type="button" onClick={() => changeQuantity(quantity - 1)}
                    style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontSize: "1.1rem", cursor: "pointer" }}>−</button>
                  <input type="number" min={1} max={999} value={quantity}
                    onChange={(e) => changeQuantity(parseInt(e.target.value, 10))}
                    style={{ width: 64, height: 34, textAlign: "center", border: "1px solid #cbd5e1", borderRadius: 8 }} />
                  <button type="button" onClick={() => changeQuantity(quantity + 1)}
                    style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontSize: "1.1rem", cursor: "pointer" }}>+</button>
                </div>
              </div>
              <p style={{ color: "#94a3b8", fontSize: ".78rem", marginTop: "-0.5rem", marginBottom: ".75rem" }}>
                Each unit multiplies the plan&apos;s device allowance on one license key.
              </p>

              {/* Coupon */}
              <div className="form-group">
                {coupon ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: ".5rem .75rem", fontSize: ".85rem" }}>
                    <span style={{ color: "#047857" }}><b>{coupon.code}</b> applied · −{fmt(coupon.discount_cents)}</span>
                    <button type="button" onClick={() => { setCoupon(null); setCouponCode(""); }}
                      style={{ border: "none", background: "none", color: "#64748b", cursor: "pointer" }}>Remove</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: ".5rem" }}>
                      <input className="form-control" placeholder="Coupon code" value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())} style={{ flex: 1, textTransform: "uppercase" }} />
                      <button type="button" onClick={() => applyCoupon()} disabled={applyingCoupon || !couponCode.trim()}
                        className="btn-primary" style={{ whiteSpace: "nowrap" }}>
                        {applyingCoupon ? "…" : "Apply"}
                      </button>
                    </div>
                    {availableCoupons.length > 0 ? (
                      <div style={{ marginTop: ".6rem" }}>
                        <div style={{ color: "#94a3b8", fontSize: ".75rem", marginBottom: ".35rem" }}>Available offers</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
                          {availableCoupons.map((c) => (
                            <button key={c.code} type="button" onClick={() => applyCoupon(c.code)} disabled={applyingCoupon}
                              title={c.description || undefined}
                              style={{ display: "inline-flex", alignItems: "center", gap: ".4rem", border: "1px dashed #a78bfa", background: "#f5f3ff", color: "#6d28d9", borderRadius: 999, padding: ".25rem .7rem", fontSize: ".78rem", cursor: "pointer" }}>
                              <b>{c.code}</b><span style={{ color: "#7c3aed" }}>· {c.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
                {couponError ? <div className="form-text text-danger" style={{ marginTop: ".35rem" }}>{couponError}</div> : null}
              </div>

              {/* Totals */}
              <div style={{ borderTop: "1px solid #e2e8f0", margin: ".5rem 0 1rem", paddingTop: ".75rem", fontSize: ".9rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                  <span>Subtotal ({quantity} × {fmt(targetPlan.price_cents)})</span>
                  <span>{fmt(subtotalCents)}</span>
                </div>
                {coupon ? (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#047857" }}>
                    <span>Discount</span><span>−{fmt(coupon.discount_cents)}</span>
                  </div>
                ) : null}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: ".35rem" }}>
                  <span>Total</span><span>{fmt(totalCents)}</span>
                </div>
              </div>

              {error ? (
                <div className="form-text text-danger" style={{ marginBottom: "1rem" }}>{error}</div>
              ) : null}

              <button type="submit" className="btn-primary" disabled={submitting} style={{ width: "100%" }}>
                {submitting ? "Redirecting to payment..." : `Pay ${fmt(totalCents)}`}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
