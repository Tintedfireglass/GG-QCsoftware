import { UserRole } from '@/lib/types';

/**
 * Scopes a partner API key can be granted.
 *
 * A scope narrows what a key may do *within* what its owner may already do —
 * it never widens it. Every partner route still runs the same service function
 * the dashboard calls, so role checks and row visibility
 * (`lib/shared/domain/visibility.ts`) apply on top of the scope check.
 */
export const PARTNER_SCOPES = [
    'qc:read',
    'qc:write',
    'machines:read',
    'machines:write',
    'licenses:read',
    'licenses:write',
    'users:read',
    'users:write',
    'fleet:read',
    'fleet:write',
    'reports:read',
] as const;

export type PartnerScope = (typeof PARTNER_SCOPES)[number];

/** Grouped for the admin UI, so scopes are picked by area rather than one long list. */
export const PARTNER_SCOPE_GROUPS: { label: string; scopes: PartnerScope[] }[] = [
    { label: 'QC results', scopes: ['qc:read', 'qc:write'] },
    { label: 'Machines', scopes: ['machines:read', 'machines:write'] },
    { label: 'Licenses', scopes: ['licenses:read', 'licenses:write'] },
    { label: 'Users', scopes: ['users:read', 'users:write'] },
    { label: 'Fleet', scopes: ['fleet:read', 'fleet:write'] },
    { label: 'Reports & exports', scopes: ['reports:read'] },
];

export const PARTNER_SCOPE_DESCRIPTIONS: Record<PartnerScope, string> = {
    'qc:read': 'Read QC results, counts and summaries',
    'qc:write': 'Hide QC results',
    'machines:read': 'Read machines and their history',
    'machines:write': 'Rename machines',
    'licenses:read': 'List license keys',
    'licenses:write': 'Generate, toggle and re-date license keys (spends credits)',
    'users:read': 'List and read team members',
    'users:write': 'Create, update and deactivate team members',
    'fleet:read': 'Read fleet inventory and lifecycle events',
    'fleet:write': 'Enrol machines and add lifecycle events',
    'reports:read': 'Export reports and read mobile QC reports',
};

/** Scopes granted by default when an admin issues a key without picking any. */
export const DEFAULT_PARTNER_SCOPES: PartnerScope[] = [
    'qc:read',
    'machines:read',
    'licenses:read',
    'reports:read',
];

/**
 * Roles that may own a partner API key.
 *
 * Deliberately excludes the GLOBAL_ROLES (SuperAdmin, Employee): a key is a
 * bearer credential living on someone else's server, so it must never resolve
 * to a principal with platform-wide visibility. It also excludes the self-only
 * roles, which have nothing to integrate.
 */
export const PARTNER_ROLES: UserRole[] = ['Reseller', 'Refurbisher', 'Enterprise', 'OEM', 'Insurer'];

/**
 * Some features are narrower than PARTNER_ROLES on the dashboard. These mirror
 * those gates so the partner API can never reach further than the panel does.
 */

/** Team members and license keys — mirrors the role lists on /api/users and /api/licenses. */
export const TEAM_MANAGE_ROLES: UserRole[] = ['Refurbisher', 'Enterprise', 'OEM', 'Insurer', 'Reseller'];

/** Fleet inventory and lifecycle — mirrors FLEET_ROLES on /api/fleet. */
export const FLEET_ROLES: UserRole[] = ['Enterprise', 'Reseller'];

export function isPartnerScope(value: string): value is PartnerScope {
    return (PARTNER_SCOPES as readonly string[]).includes(value);
}

export function canOwnPartnerKey(role: UserRole): boolean {
    return PARTNER_ROLES.includes(role);
}
