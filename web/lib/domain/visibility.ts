import { sql, type SQL } from 'drizzle-orm';
import { AuthenticatedUser } from '@/lib/auth-middleware';
import { UserRole } from '@/lib/types';

/** Roles that see only their own rows. */
export const SELF_ONLY_ROLES: UserRole[] = ['Technician', 'Client', 'B2CDevice'];

/** Roles that see their own rows plus those of users they created (their team). */
export const TEAM_ROLES: UserRole[] = ['Refurbisher', 'Enterprise', 'OEM', 'Insurer', 'Reseller'];

/** Roles with unrestricted visibility. */
export const GLOBAL_ROLES: UserRole[] = ['SuperAdmin', 'Employee'];

/**
 * Build a Drizzle `sql` WHERE fragment restricting `ownerColumn`
 * (e.g. `qr.technician_id`) to the rows `user` is permitted to see — the single
 * source of truth for role-based row visibility, composed via `db.execute`.
 * Returns undefined when the role is unrestricted. `ownerColumn` is a trusted,
 * code-supplied identifier.
 */
export function ownerVisibilitySql(user: AuthenticatedUser, ownerColumn: string): SQL | undefined {
    const col = sql.raw(ownerColumn);
    if (GLOBAL_ROLES.includes(user.role)) return undefined;
    if (TEAM_ROLES.includes(user.role)) {
        return sql`(${col} = ${user.id} OR ${col} IN (SELECT id FROM users WHERE created_by = ${user.id}))`;
    }
    return sql`${col} = ${user.id}`;
}
