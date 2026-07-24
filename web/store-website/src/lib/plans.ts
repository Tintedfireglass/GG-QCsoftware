import { apiUrl } from "./api-base";

// The storefront's paid plans come exclusively from the admin app's public
// catalog (GET /api/plans → active plans, ordered by sort_order). Nothing about a
// purchasable plan — name, price, period, features, platforms — is stored in the
// website, so edits in the dashboard are the single source of truth.
//
// Fetched server-side and cached ~5 min via ISR, the same way installers are
// resolved in ./releases. If the API base is unset or the call fails, the section
// simply renders no paid cards (the free trial and Enterprise cards still show).

export interface CatalogPlan {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  features: string[] | null;
  duration_days: number | null;
  /** Platform tabs this plan appears under. Empty/null = every tab. */
  product_scope: string[] | null;
}

export async function getCatalogPlans(): Promise<CatalogPlan[]> {
  const url = apiUrl("plans");
  if (!url) return []; // no API base configured → no paid plans
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.plans) ? (data.plans as CatalogPlan[]) : [];
  } catch {
    return []; // never break the page on a catalog outage
  }
}

/** "/ month", "/ 6 months", "/ lifetime" — derived from the plan's duration. */
export function planPeriodLabel(days: number | null): string {
  if (days == null) return "/ lifetime";
  if (days >= 28 && days <= 31) return "/ month";
  if (days >= 360 && days <= 370) return "/ year";
  // Whole-month durations read better as months (180 → "/ 6 months").
  const months = Math.round(days / 30);
  if (months > 1 && Math.abs(days - months * 30) <= 2) return `/ ${months} months`;
  return `/ ${days} days`;
}
