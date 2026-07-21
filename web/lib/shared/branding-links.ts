/**
 * Dashboard-hosted link paths, derived from the configured public origin.
 *
 * These are code, not configuration: an admin sets one base URL and every link
 * below follows. Kept in a dependency-free module so client components can call
 * them without pulling the settings service (and the database) into the bundle.
 */

/** Certificate verification page for a health/report id. */
export function verifyUrl(appUrl: string, id: string | number): string {
    return `${appUrl}/verify/${id}`;
}

/** Customer account portal — the link emailed after a purchase. */
export function customerPortalUrl(appUrl: string): string {
    return `${appUrl}/customer/account`;
}
