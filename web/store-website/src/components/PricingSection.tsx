"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { pricing, type PricingPlan } from "@/data/content";
import { config } from "@/data/config";
import { apiUrl } from "@/lib/api-base";
import DownloadButton from "@/components/DownloadButton";
import type { DownloadOption } from "@/lib/releases";

// Pricing section (ported from index.php).
//
// Every card carrying a `planId` is driven by the live plans catalog from the
// admin app via /api/plans, so edits in the dashboard reflect here. Card order is
// the order in `pricing.plans` (Starter → Basic → Professional), independent of
// the catalog's own sort_order. "Buy Now" links to the dedicated /checkout page,
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
  product_scope: string[] | null;
}

type DisplayPlan = PricingPlan;

function periodLabel(days: number | null): string {
  if (days == null) return "/ lifetime";
  if (days >= 28 && days <= 31) return "/ month";
  if (days >= 360 && days <= 370) return "/ year";
  // Whole-month durations read better as months (180 → "/ 6 months").
  const months = Math.round(days / 30);
  if (months > 1 && Math.abs(days - months * 30) <= 2) return `/ ${months} months`;
  return `/ ${days} days`;
}

const fmt = (cents: number) => `${config.CURRENCY_SYMBOL}${(cents / 100).toLocaleString()}`;

// Merge a live plan onto a static card, keeping the card's styling (featured/badge).
function toCard(base: PricingPlan, p: LivePlan): DisplayPlan {
  return {
    ...base,
    planId: p.id,
    platforms:
      p.product_scope && p.product_scope.length > 0
        ? p.product_scope
        : base.platforms,
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

export default function PricingSection({
  downloadUrl,
  downloadOptions = [],
}: {
  downloadUrl?: string;
  /** Same installer list the banner's "Download now" button uses. */
  downloadOptions?: DownloadOption[];
}) {
  // Free Trial card links to the app download; point it at the live installer
  // URL resolved server-side (falls back to the static one).
  const resolveLink = (link?: string) =>
    link === config.DOWNLOAD_URL ? downloadUrl || config.DOWNLOAD_URL : link;

  const [notice, setNotice] = useState(false);
  const [platform, setPlatform] = useState(pricing.platformTabs[0].id);
  const [plans, setPlans] = useState<DisplayPlan[]>(() =>
    pricing.plans.map((p) => ({ ...p, ctaLink: resolveLink(p.ctaLink) })),
  );

  // Cards with no `platforms` (Free Trial, Enterprise) show under every tab.
  const visiblePlans = plans.filter(
    (p) => !p.platforms || p.platforms.includes(platform),
  );
  const hasPaidPlan = visiblePlans.some((p) => p.planId);

  // The trial CTA only offers builds for the selected tab, so Windows resolves
  // to a single installer (direct download) while Mac lists Apple Silicon and
  // Intel. Falls back to the full list if nothing is published for the tab.
  const tabDownloads = downloadOptions.filter((o) => o.platform === platform);
  const trialDownloads = tabDownloads.length > 0 ? tabDownloads : downloadOptions;

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
          prev
            // A card whose plan is no longer in the active catalog is dropped —
            // its checkout would fail anyway.
            .filter((card) => !card.planId || byId.has(card.planId))
            .map((card) =>
              card.planId ? toCard(card, byId.get(card.planId)!) : card,
            ),
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

        {/* Platform tabs — plans are per-platform, the trial and Enterprise
            cards are shared across both. */}
        <div className="pricing-tabs" role="tablist" aria-label="Choose a platform">
          {pricing.platformTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`pricing-tab-${tab.id}`}
              aria-selected={platform === tab.id}
              aria-controls="pricing-plans"
              className={`pricing-tab${platform === tab.id ? " active" : ""}`}
              onClick={() => setPlatform(tab.id)}
            >
              <i className={tab.icon} aria-hidden="true"></i>
              {tab.label}
            </button>
          ))}
        </div>

        {notice ? (
          <p className="text-center text-muted" role="status">
            Online purchase is being reconnected to our new payment system and
            will be available shortly.
          </p>
        ) : null}

        {!hasPaidPlan ? (
          <p className="pricing-empty-note">{pricing.emptyPlatformText}</p>
        ) : null}

        <div
          className="row g-4 justify-content-center"
          id="pricing-plans"
          role="tabpanel"
          aria-labelledby={`pricing-tab-${platform}`}
        >
          {visiblePlans.map((plan) => (
            <div className="col-md-6 col-lg-4 pricing-col" key={plan.planId ?? plan.title}>
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
                ) : plan.ctaDownload && trialDownloads.length > 0 ? (
                  // Same installer picker as the banner's "Download now",
                  // narrowed to the platform tab in view.
                  <DownloadButton
                    options={trialDownloads}
                    ctaText={plan.ctaText}
                    className={`pricing-btn ${plan.ctaClass}`}
                    block
                  />
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
