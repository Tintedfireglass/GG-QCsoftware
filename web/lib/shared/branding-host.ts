/**
 * Host handling for domain-based branding.
 *
 * Reseller branding is selected by the host the panel was reached on, so the
 * value an admin types and the value taken off a request must normalise to
 * exactly the same string. Both go through normalizeHost().
 *
 * Dependency-free so the admin form can validate a domain client-side using the
 * same rules the server matches with.
 */

/** A hostname label: alphanumerics and hyphens, not starting/ending with one. */
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOSTNAME_RE = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);

/**
 * Reduces anything host-shaped to the canonical form stored and compared:
 * lowercase, no scheme, no port, no path, no trailing dot, no "www." prefix.
 * Returns null when the input is not a usable hostname.
 *
 * "www." is stripped rather than rejected so a reseller reached on both
 * `acme.com` and `www.acme.com` is branded on either.
 */
export function normalizeHost(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    let host = input.trim().toLowerCase();
    if (!host) return null;

    host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme
    host = host.split('/')[0];                          // path
    host = host.split('?')[0];

    // IPv6 arrives bracketed ("[::1]:3000") precisely because its own colons are
    // ambiguous with the port separator — so unwrap it and stop. Stripping a
    // ":port" suffix afterwards would eat the address's last group instead.
    const bracketed = host.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (bracketed) return bracketed[1] || null;

    // A single colon can only be a port separator; several mean an unbracketed
    // IPv6 address, where there is no port to strip.
    if ((host.match(/:/g) ?? []).length === 1) host = host.replace(/:\d+$/, '');
    host = host.replace(/\.+$/, '');                    // trailing dot
    host = host.replace(/^www\./, '');
    if (!host) return null;

    // localhost and bare IPs are valid request hosts but can never be a
    // reseller's assigned domain, so they normalise but do not validate.
    return host;
}

/** True when `value` is a hostname an admin may assign to a reseller. */
export function isAssignableDomain(value: string): boolean {
    return HOSTNAME_RE.test(value) && value.length <= 253;
}

/**
 * Normalises and validates a domain an admin typed, or returns null if it is
 * not one that could ever match a request (bare `localhost`, an IP, a
 * single-label name).
 */
export function normalizeAssignableDomain(input: unknown): string | null {
    const host = normalizeHost(input);
    return host && isAssignableDomain(host) ? host : null;
}

/**
 * The host a request arrived on. Prefers x-forwarded-host: behind the platform's
 * proxy the `host` header is the internal origin, and the reseller's domain is
 * only visible in the forwarded one.
 */
export function hostFromHeaders(headers: {
    get(name: string): string | null;
}): string | null {
    const forwarded = headers.get('x-forwarded-host');
    // A proxy chain sends a comma-separated list; the first entry is the client-
    // facing host.
    const candidate = forwarded?.split(',')[0] ?? headers.get('host');
    return normalizeHost(candidate);
}
