"use client";

import { useState } from "react";
import Link from "next/link";
import { pricing, type StaticPricingCard } from "@/data/content";
import { config } from "@/data/config";
import DownloadButton from "@/components/DownloadButton";
import type { DownloadOption } from "@/lib/releases";
import { planPeriodLabel, type CatalogPlan } from "@/lib/plans";

// Pricing section (ported from index.php).
//
// Every paid card is built from the live plans catalog (/api/plans, fetched
// server-side in lib/plans.ts) — name, price, period, features and the platform
// tab it belongs to all come from the admin dashboard. Nothing about a
// purchasable plan is stored in the website, so there is no static fallback: if
// the catalog is empty or unreachable, only the Free Trial and Enterprise cards
// (which aren't catalog plans) render. Card order follows the catalog's own
// sort_order. "Buy Now" links to /checkout, where the buyer picks per-platform
// device counts and completes a guest checkout.

type DisplayCard = StaticPricingCard & { planId?: number };

const fmt = (cents: number) => `${config.CURRENCY_SYMBOL}${(cents / 100).toLocaleString()}`;

function toCard(p: CatalogPlan, featured: boolean): DisplayCard {
  return {
    planId: p.id,
    title: p.name,
    subtitle: p.description || "",
    price: fmt(p.price_cents),
    period: planPeriodLabel(p.duration_days),
    features: p.features ?? [],
    ctaText: "Buy Now",
    ctaClass: featured ? "pricing-btn-primary" : "pricing-btn-outline",
    featured,
    badge: featured ? "Recommended" : undefined,
  };
}

export default function PricingSection({
  downloadUrl,
  downloadOptions = [],
  plans = [],
}: {
  downloadUrl?: string;
  /** Same installer list the banner's "Download now" button uses. */
  downloadOptions?: DownloadOption[];
  /** Active plans from the admin catalog, in sort_order. */
  plans?: CatalogPlan[];
}) {
  const [notice, setNotice] = useState(false);
  const [platform, setPlatform] = useState(pricing.platformTabs[0].id);

  // Free Trial card links to the app download; point it at the live installer
  // URL resolved server-side (falls back to the static one).
  const trialCard: DisplayCard = {
    ...pricing.freeTrial,
    ctaLink:
      pricing.freeTrial.ctaLink === config.DOWNLOAD_URL
        ? downloadUrl || config.DOWNLOAD_URL
        : pricing.freeTrial.ctaLink,
  };

  // Plans with no product_scope are treated as covering every tab.
  const tabPlans = plans.filter(
    (p) => !p.product_scope?.length || p.product_scope.includes(platform),
  );
  // The catalog has no "featured" flag, so the priciest plan in the tab carries
  // the Recommended badge (ties → the first one in sort_order).
  const topPrice = tabPlans.reduce((max, p) => Math.max(max, p.price_cents), -1);
  const featuredIndex = tabPlans.findIndex((p) => p.price_cents === topPrice);

  const visibleCards: DisplayCard[] = [
    trialCard,
    ...tabPlans.map((p, i) => toCard(p, i === featuredIndex)),
    pricing.enterprise,
  ];
  const hasPaidPlan = tabPlans.length > 0;

  // The trial CTA only offers builds for the selected tab, so Windows resolves
  // to a single installer (direct download) while Mac lists Apple Silicon and
  // Intel. Falls back to the full list if nothing is published for the tab.
  const tabDownloads = downloadOptions.filter((o) => o.platform === platform);
  const trialDownloads = tabDownloads.length > 0 ? tabDownloads : downloadOptions;

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
          {visibleCards.map((plan) => (
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
                {/* CTA sits directly under the price, above the feature list. */}
                <div className="pricing-card-cta">
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
                <ul className="pricing-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <i className="fas fa-check-circle"></i> {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
