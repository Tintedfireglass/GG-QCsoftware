"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { pricing, type PricingPlan } from "@/data/content";
import { config } from "@/data/config";
import { apiUrl } from "@/lib/api-base";

// Pricing section (ported from index.php).
//
// The Basic and Professional cards are driven by the live plans catalog from the
// admin app (plan id 1 → Basic, id 2 → Professional) via /api/plans, so edits in
// the dashboard reflect here. "Buy Now" links to the dedicated /checkout page,
// where the buyer picks per-platform device counts and completes a guest checkout.
// Free Trial and Enterprise stay static. If the API is unreachable, all cards fall
// back to their static content.

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
                  <Link
                    href={`/checkout?planId=${plan.planId}`}
                    className={`pricing-btn ${plan.ctaClass}`}
                  >
                    {plan.ctaText}
                  </Link>
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
    </section>
  );
}
