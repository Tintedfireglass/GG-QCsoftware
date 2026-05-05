import { NextRequest, NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
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

        if ((authUser.role === 'Refurbisher' || authUser.role === 'Enterprise' || authUser.role === 'OEM' || authUser.role === 'Insurer' || authUser.role === 'Reseller') && !canManageUser(authUser, userId, targetUser.created_by)) {
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
            'SELECT id, role, created_by, license_credits FROM users WHERE id = $1',
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
            if (!email?.trim()) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'Email is required' } as ApiError,
                    { status: 400 }
                );
            }
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
            const validRoles: UserRole[] = ['SuperAdmin', 'Employee', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'Client'];
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

        const isResellerAllocatingCredits = authUser.role === 'Reseller' && license_credits !== undefined;

        if (license_credits !== undefined && authUser.role === 'SuperAdmin') {
            updates.push(`license_credits = $${paramIndex++}`);
            values.push(license_credits);
        }

        if (updates.length === 0 && !isResellerAllocatingCredits) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'No fields to update' } as ApiError,
                { status: 400 }
            );
        }

        if (isResellerAllocatingCredits) {
            if (targetUser.role !== 'Client') {
                return NextResponse.json(
                    { error: 'Authorization Error', message: 'Resellers can only allocate credits to Client users' } as ApiError,
                    { status: 403 }
                );
            }

            const desiredCreditsRaw = Number(license_credits);
            if (Number.isNaN(desiredCreditsRaw)) {
                return NextResponse.json(
                    { error: 'Validation Error', message: 'license_credits must be a number' } as ApiError,
                    { status: 400 }
                );
            }
            const desiredCredits = Math.max(0, desiredCreditsRaw);
            const currentCredits = Number(targetUser.license_credits || 0);
            const delta = desiredCredits - currentCredits;

            if (delta !== 0 || updates.length > 0) {
                const result = await transaction(async (client) => {
                    const resellerRes = await client.query(
                        'SELECT license_credits FROM users WHERE id = $1 FOR UPDATE',
                        [authUser.id]
                    );
                    const resellerCredits = Number(resellerRes.rows[0]?.license_credits || 0);

                    if (delta > 0 && resellerCredits < delta) {
                        throw new Error('INSUFFICIENT_CREDITS');
                    }

                    if (delta !== 0) {
                        await client.query(
                            'UPDATE users SET license_credits = license_credits - $1 WHERE id = $2',
                            [delta, authUser.id]
                        );
                        await client.query(
                            'UPDATE users SET license_credits = $1 WHERE id = $2',
                            [desiredCredits, userId]
                        );
                    }

                    if (updates.length > 0) {
                        const updateValues = [...values, userId];
                        await client.query(
                            `UPDATE users 
                             SET ${updates.join(', ')}
                             WHERE id = $${paramIndex}`,
                            updateValues
                        );
                    }

                    const updatedUser = await client.query(
                        'SELECT id, username, email, display_name, role, created_by, is_active, license_credits, created_at FROM users WHERE id = $1',
                        [userId]
                    );
                    return updatedUser.rows[0];
                });

                return NextResponse.json({
                    message: 'User updated successfully',
                    user: result,
                });
            }
            if (delta === 0 && updates.length === 0) {
                const currentUser = await query(
                    'SELECT id, username, email, display_name, role, created_by, is_active, license_credits, created_at FROM users WHERE id = $1',
                    [userId]
                );
                return NextResponse.json({
                    message: 'User updated successfully',
                    user: currentUser[0],
                });
            }
        }

        // Execute update (non-reseller or no credit allocation)
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
        if (error instanceof Error && error.message === 'INSUFFICIENT_CREDITS') {
            return NextResponse.json(
                { error: 'Credit Error', message: 'Insufficient license credits to allocate' } as ApiError,
                { status: 403 }
            );
        }
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
