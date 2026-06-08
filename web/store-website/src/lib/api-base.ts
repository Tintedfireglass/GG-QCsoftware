// Single base URL for all calls to the Pramaan admin app's API.
// Set in the store website's env, e.g.:
//   NEXT_PUBLIC_API_BASE="https://app.pramaan.gadgetguruz.com/api/"
// If unset, API calls are a silent no-op / blocked (safe for local dev).

const BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export function hasApiBase(): boolean {
    return !!BASE;
}

/** Join the configured API base with an endpoint path (handles slashes). */
export function apiUrl(path: string): string {
    if (!BASE) return "";
    return BASE.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

/** The admin app's site origin (API base minus the trailing /api). Used to link
 *  to the customer storefront, e.g. appUrl("customer/account"). */
export function appUrl(path: string): string {
    if (!BASE) return "";
    const origin = BASE.replace(/\/+$/, "").replace(/\/api$/, "");
    return origin + "/" + path.replace(/^\/+/, "");
}
