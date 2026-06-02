import { AuthenticatedUser, canManageUser } from '@/lib/auth-middleware';
import { hashPassword } from '@/lib/auth';
import { ValidationError, ForbiddenError, NotFoundError } from '@/lib/http/errors';
import { TEAM_ROLES } from '@/lib/domain/visibility';
import { ListUsersQuery, UpdateUserInput } from '@/lib/domain/schemas/users';
import { UserRole } from '@/lib/types';
import * as repo from '@/lib/repositories/users.repo';
import type { UserUpdateSet } from '@/lib/repositories/users.repo';

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
    if (TEAM_ROLES.includes(authUser.role) && !canManageUser(authUser, userId, target.created_by as number | undefined)) {
        throw new ForbiddenError('You can only view users in your team');
    }

    return { user: target };
}

export async function updateUser(authUser: AuthenticatedUser, id: string, body: UpdateUserInput) {
    const userId = parseUserId(id);
    const target = await repo.findUserForManage(userId);
    if (!target) throw new NotFoundError('User not found');
    if (!canManageUser(authUser, userId, target.created_by ?? undefined)) {
        throw new ForbiddenError('You cannot modify this user');
    }

    const { email, display_name, role, is_active, password, license_credits } = body;
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

    const hasFieldUpdates = Object.keys(set).length > 0;
    const isResellerAllocatingCredits = authUser.role === 'Reseller' && license_credits != null;

    if (!hasFieldUpdates && !isResellerAllocatingCredits) {
        throw new ValidationError('No fields to update');
    }

    if (isResellerAllocatingCredits) {
        if (target.role !== 'Client') {
            throw new ForbiddenError('Resellers can only allocate credits to Client users');
        }
        const desiredRaw = Number(license_credits);
        if (Number.isNaN(desiredRaw)) throw new ValidationError('license_credits must be a number');
        const desiredCredits = Math.max(0, desiredRaw);
        const delta = desiredCredits - Number(target.license_credits || 0);

        const user = (delta !== 0 || hasFieldUpdates)
            ? await repo.allocateResellerCreditsAndUpdate({ resellerId: authUser.id, userId, desiredCredits, delta, set, hasFieldUpdates })
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
    if (!canManageUser(authUser, userId, target.created_by ?? undefined)) {
        throw new ForbiddenError('You cannot deactivate this user');
    }
    await repo.deactivateUser(userId);
    return { message: 'User deactivated successfully' };
}
