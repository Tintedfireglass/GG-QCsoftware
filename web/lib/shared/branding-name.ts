/**
 * Brand-name rules for white-label branding.
 *
 * Dependency-free so the admin form can warn with exactly the limit the server
 * enforces, the same way branding-host.ts shares the domain rules.
 */

/**
 * Longest brand name accepted. It has to fit a browser tab, a PDF header and
 * phrases the product builds around it ("<name> Health Score"), so this is a
 * readability limit rather than a storage one.
 */
export const MAX_SITE_NAME = 40;
