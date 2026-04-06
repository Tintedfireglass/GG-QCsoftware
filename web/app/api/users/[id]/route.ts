import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { ApiError, UpdateUserRequest, UserWithCreator, UserRole } from '@/lib/types';
import { authenticateRequest, requireRole, canManageUser, getCreatableRoles } from '@/lib/auth-middleware';

// GET /api/users/[id] - Get single user
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Invalid user ID' } as ApiError,
                { status: 400 }
            );
        }

        // Authenticate the request
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError) return authError;
        if (!authUser) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Not authenticated' } as ApiError,
                { status: 401 }
            );
        }

        // Get the target user
        const users = await query<UserWithCreator>(
            `SELECT 
                u.id, 
                u.username, 
                u.email, 
                u.display_name,
                u.role, 
                u.created_by,
                u.is_active, 
                u.license_credits,
                u.created_at,
                creator.username as creator_username,
                (SELECT COUNT(*) FROM users WHERE created_by = u.id) as team_size
             FROM users u
             LEFT JOIN users creator ON u.created_by = creator.id
             WHERE u.id = $1`,
            [userId]
        );

        if (users.length === 0) {
            return NextResponse.json(
                { error: 'Not Found', message: 'User not found' } as ApiError,
                { status: 404 }
            );
        }

        const targetUser = users[0];

        // Check if the authenticated user can view this user
        if ((authUser.role === 'Technician' || authUser.role === 'Client') && authUser.id !== userId) {
            return NextResponse.json(
                { error: 'Authorization Error', message: 'You can only view your own profile' } as ApiError,
                { status: 403 }
            );
        }

        if ((authUser.role === 'Refurbisher' || authUser.role === 'Enterprise') && !canManageUser(authUser, userId, targetUser.created_by)) {
            return NextResponse.json(
                { error: 'Authorization Error', message: 'You can only view users in your team' } as ApiError,
                { status: 403 }
            );
        }

        return NextResponse.json({ user: targetUser });
    } catch (error) {
        console.error('Get user error:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'An error occurred while fetching user' } as ApiError,
            { status: 500 }
        );
    }
}

// PUT /api/users/[id] - Update user
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Invalid user ID' } as ApiError,
                { status: 400 }
            );
        }

        // Authenticate the request
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError) return authError;
        if (!authUser) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Not authenticated' } as ApiError,
                { status: 401 }
            );
        }

        // Get the target user first
        const existingUsers = await query(
            'SELECT id, role, created_by FROM users WHERE id = $1',
            [userId]
        );

        if (existingUsers.length === 0) {
            return NextResponse.json(
                { error: 'Not Found', message: 'User not found' } as ApiError,
                { status: 404 }
            );
        }

        const targetUser = existingUsers[0];

        // Check permissions
        if (!canManageUser(authUser, userId, targetUser.created_by)) {
            return NextResponse.json(
                { error: 'Authorization Error', message: 'You cannot modify this user' } as ApiError,
                { status: 403 }
            );
        }

        const body: UpdateUserRequest = await request.json();
        const { email, display_name, role, is_active, password, license_credits } = body;

        // Build update query dynamically
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (email !== undefined) {
            updates.push(`email = $${paramIndex++}`);
            values.push(email);
        }

        if (display_name !== undefined) {
            updates.push(`display_name = $${paramIndex++}`);
            values.push(display_name);
        }

        if (role !== undefined) {
            // Only SuperAdmin can change roles
            if (authUser.role !== 'SuperAdmin') {
                return NextResponse.json(
                    { error: 'Authorization Error', message: 'Only Super Admins can change user roles' } as ApiError,
                    { status: 403 }
                );
            }

            // Validate the role
            const validRoles: UserRole[] = ['SuperAdmin', 'Refurbisher', 'Technician', 'Enterprise', 'Client'];
            if (!validRoles.includes(role)) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Invalid role' } as ApiError,
                    { status: 400 }
                );
            }

            updates.push(`role = $${paramIndex++}`);
            values.push(role);
        }

        if (is_active !== undefined) {
            updates.push(`is_active = $${paramIndex++}`);
            values.push(is_active);
        }

        if (password) {
            const passwordHash = await hashPassword(password);
            updates.push(`password_hash = $${paramIndex++}`);
            values.push(passwordHash);
        }

        if (license_credits !== undefined && authUser.role === 'SuperAdmin') {
            updates.push(`license_credits = $${paramIndex++}`);
            values.push(license_credits);
        }

        if (updates.length === 0) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'No fields to update' } as ApiError,
                { status: 400 }
            );
        }

        // Execute update
        values.push(userId);
        const result = await query(
            `UPDATE users 
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex}
             RETURNING id, username, email, display_name, role, created_by, is_active, license_credits, created_at`,
            values
        );

        return NextResponse.json({
            message: 'User updated successfully',
            user: result[0],
        });
    } catch (error) {
        console.error('Update user error:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'An error occurred while updating user' } as ApiError,
            { status: 500 }
        );
    }
}

// DELETE /api/users/[id] - Deactivate user (soft delete)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Invalid user ID' } as ApiError,
                { status: 400 }
            );
        }

        // Authenticate the request
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError) return authError;
        if (!authUser) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Not authenticated' } as ApiError,
                { status: 401 }
            );
        }

        // Prevent self-deletion
        if (authUser.id === userId) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'You cannot deactivate your own account' } as ApiError,
                { status: 400 }
            );
        }

        // Get the target user
        const existingUsers = await query(
            'SELECT id, role, created_by FROM users WHERE id = $1',
            [userId]
        );

        if (existingUsers.length === 0) {
            return NextResponse.json(
                { error: 'Not Found', message: 'User not found' } as ApiError,
                { status: 404 }
            );
        }

        const targetUser = existingUsers[0];

        // Check permissions
        if (!canManageUser(authUser, userId, targetUser.created_by)) {
            return NextResponse.json(
                { error: 'Authorization Error', message: 'You cannot deactivate this user' } as ApiError,
                { status: 403 }
            );
        }

        // Soft delete (deactivate)
        await query(
            'UPDATE users SET is_active = false WHERE id = $1',
            [userId]
        );

        return NextResponse.json({
            message: 'User deactivated successfully',
        });
    } catch (error) {
        console.error('Delete user error:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'An error occurred while deactivating user' } as ApiError,
            { status: 500 }
        );
    }
}
