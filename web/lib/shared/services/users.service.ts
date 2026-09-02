import { AuthenticatedUser, canManageUser } from '@/lib/auth-middleware';
import { hashPassword } from '@/lib/auth';
import { ValidationError, ForbiddenError, NotFoundError } from '@/lib/http/errors';
import { TEAM_ROLES } from '@/lib/shared/domain/visibility';
import { ListUsersQuery, UpdateUserInput } from '@/lib/shared/domain/schemas/users';
import { UserRole } from '@/lib/types';
import * as repo from '@/lib/shared/repositories/users.repo';
import type { UserUpdateSet } from '@/lib/shared/repositories/users.repo';

const ASSIGNABLE_ROLES: UserRole[] = [
    'SuperAdmin', 'Employee', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'Client',
];

function parseUserId(id: string): number {
    const n = parseInt(id, 10);
    if (Number.isNaN(n)) throw new ValidationError('Invalid user ID');
    return n;
}

export async function listUsers(user: AuthenticatedUser, q: ListUsersQuery) {
    const offset = (q.page - 1) * q.limit;
    const { users, total } = await repo.listUsers(user, {
        limit: q.limit,
        offset,
        search: q.search || undefined,
        role: q.role || undefined,
    });

    return {
        users,
        pagination: {
            page: q.page,
            limit: q.limit,
            total,
            totalPages: Math.ceil(total / q.limit),
        },
    };
}

export async function getUserStats(user: AuthenticatedUser) {
    const { total, admins, technicians } = await repo.userStats(user);
    return { totalUsers: total, totalAdmins: admins, totalTechnicians: technicians };
}

export async function getUser(authUser: AuthenticatedUser, id: string) {
    const userId = parseUserId(id);
    const target = await repo.findUserDetail(userId);
    if (!target) throw new NotFoundError('User not found');

    if ((authUser.role === 'Technician' || authUser.role === 'Client') && authUser.id !== userId) {
        throw new ForbiddenError('You can only view your own profile');
    }
    if (TEAM_ROLES.includes(authUser.role) && !canManageUser(authUser, userId, target.created_by as number | undefined, target.role as UserRole | undefined)) {
        throw new ForbiddenError('You can only view users in your team');
    }

    return { user: target };
}

export async function updateUser(authUser: AuthenticatedUser, id: string, body: UpdateUserInput) {
    const userId = parseUserId(id);
    const target = await repo.findUserForManage(userId);
    if (!target) throw new NotFoundError('User not found');
    if (!canManageUser(authUser, userId, target.created_by ?? undefined, target.role as UserRole | undefined)) {
        throw new ForbiddenError('You cannot modify this user');
    }

    const { email, display_name, role, is_active, password, license_credits,
        allow_monthly_keys, allow_quarterly_keys, allow_6month_keys, allow_yearly_keys, allow_perpetual_keys,
        allow_windows_keys, allow_android_keys, allow_ios_keys, allow_mac_keys,
        allow_qr_label_download
    } = body;
    const set: UserUpdateSet = {};

    if (email !== undefined) {
        if (!email.trim()) throw new ValidationError('Email is required');
        set.email = email;
    }
    if (display_name !== undefined) set.displayName = display_name;
    if (role !== undefined) {
        if (authUser.role !== 'SuperAdmin') throw new ForbiddenError('Only Super Admins can change user roles');
        if (!ASSIGNABLE_ROLES.includes(role as UserRole)) throw new ValidationError('Invalid role');
        set.role = role;
    }
    if (is_active !== undefined) set.isActive = is_active;
    if (password) set.passwordHash = await hashPassword(password);
    if (license_credits != null && authUser.role === 'SuperAdmin') set.licenseCredits = license_credits;

    // Duration permission flags
    // SuperAdmin can set any flag for eligible (non-admin) roles.
    // Resellers can set flags for their own Clients, but only up to their own level.
    if (authUser.role === 'SuperAdmin' && target.role !== 'SuperAdmin' && target.role !== 'Employee') {
        if (allow_monthly_keys !== undefined) set.allowMonthlyKeys = allow_monthly_keys;
        if (allow_quarterly_keys !== undefined) set.allowQuarterlyKeys = allow_quarterly_keys;
        if (allow_6month_keys !== undefined) set.allow6MonthKeys = allow_6month_keys;
        if (allow_yearly_keys !== undefined) set.allowYearlyKeys = allow_yearly_keys;
        if (allow_perpetual_keys !== undefined) set.allowPerpetualKeys = allow_perpetual_keys;
    } else if (authUser.role === 'Reseller' && target.role === 'Client') {
        // Load the reseller's own flags to enforce delegation limits
        const resellerRow = await repo.findUserPermissions(authUser.id);
        if (allow_monthly_keys !== undefined && resellerRow?.allowMonthlyKeys) set.allowMonthlyKeys = allow_monthly_keys;
        if (allow_yearly_keys !== undefined && resellerRow?.allowYearlyKeys) set.allowYearlyKeys = allow_yearly_keys;
        if (allow_perpetual_keys !== undefined && resellerRow?.allowPerpetualKeys) set.allowPerpetualKeys = allow_perpetual_keys;
        // A reseller cannot grant a permission they don't have — silently ignore those
    }

    // Per-platform license permissions — SuperAdmin only, for Employees.
    if (authUser.role === 'SuperAdmin' && target.role === 'Employee') {
        if (allow_windows_keys !== undefined) set.allowWindowsKeys = allow_windows_keys;
        if (allow_android_keys !== undefined) set.allowAndroidKeys = allow_android_keys;
        if (allow_ios_keys !== undefined) set.allowIosKeys = allow_ios_keys;
        if (allow_mac_keys !== undefined) set.allowMacKeys = allow_mac_keys;
    }

    // QR label download toggle — SuperAdmin can set for any non-SuperAdmin user;
    // admin-tier roles (Refurbisher, Reseller, Enterprise, OEM, Insurer) can set it
    // for users they manage (their team members/clients).
    const canToggleQR = authUser.role === 'SuperAdmin' ||
        (TEAM_ROLES.includes(authUser.role) && target.role !== 'SuperAdmin');
    if (canToggleQR && allow_qr_label_download !== undefined) {
        set.allowQrLabelDownload = allow_qr_label_download;
    }

    const hasFieldUpdates = Object.keys(set).length > 0;
    // Team managers transfer credits from their own balance to users they
    // created. Technicians can now receive credits alongside clients.
    const isTeamManagerAllocatingCredits = TEAM_ROLES.includes(authUser.role) && license_credits != null;

    if (!hasFieldUpdates && !isTeamManagerAllocatingCredits) {
        throw new ValidationError('No fields to update');
    }

    if (isTeamManagerAllocatingCredits) {
        if (target.role !== 'Client' && target.role !== 'Technician') {
            throw new ForbiddenError('Team managers can only allocate credits to Client or Technician users');
        }
        const desiredRaw = Number(license_credits);
        if (Number.isNaN(desiredRaw)) throw new ValidationError('license_credits must be a number');
        const desiredCredits = Math.max(0, desiredRaw);
        const delta = desiredCredits - Number(target.license_credits || 0);

        const user = (delta !== 0 || hasFieldUpdates)
            ? await repo.allocateTeamCreditsAndUpdate({ managerId: authUser.id, userId, desiredCredits, delta, set, hasFieldUpdates })
            : await repo.findUserBasic(userId);
        return { message: 'User updated successfully', user };
    }

    const user = await repo.updateUser(userId, set);
    return { message: 'User updated successfully', user };
}

export async function deactivateUser(authUser: AuthenticatedUser, id: string) {
    const userId = parseUserId(id);
    if (authUser.id === userId) {
        throw new ValidationError('You cannot deactivate your own account');
    }
    const target = await repo.findUserForManage(userId);
    if (!target) throw new NotFoundError('User not found');
    if (!canManageUser(authUser, userId, target.created_by ?? undefined, target.role as UserRole | undefined)) {
        throw new ForbiddenError('You cannot deactivate this user');
    }
    await repo.deactivateUser(userId);
    return { message: 'User deactivated successfully' };
}
