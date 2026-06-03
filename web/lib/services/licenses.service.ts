import { db } from '@/lib/drizzle';
import { AuthenticatedUser } from '@/lib/auth-middleware';
import { AppError, ValidationError, ForbiddenError, NotFoundError } from '@/lib/http/errors';
import { GenerateLicenseInput, ToggleLicenseInput } from '@/lib/domain/schemas/licenses';
import * as repo from '@/lib/repositories/licenses.repo';

const VALID_TYPES = ['single_use', 'bulk', 'demo'];

/** 16-char grouped key, excluding ambiguous chars (0/O/1/I). */
function generateRandomKey(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) result += '-';
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export async function listLicenses(user: AuthenticatedUser) {
    return { keys: await repo.listLicenses(user) };
}

export async function generateLicense(user: AuthenticatedUser, input: GenerateLicenseInput) {
    const { type, max_uses, expires_at, demo_customer_name } = input;

    if (!type || !VALID_TYPES.includes(type)) {
        throw new ValidationError('Invalid input parameters');
    }
    if (user.role === 'Employee' && type !== 'demo') {
        throw new ForbiddenError('Employees can only generate demo keys');
    }
    if (type === 'demo' && user.role !== 'SuperAdmin' && user.role !== 'Employee') {
        throw new ForbiddenError('Only SuperAdmin and Employee users can generate demo keys');
    }

    const normalizedMaxUses = type === 'demo' ? 1 : max_uses;
    if (!normalizedMaxUses || normalizedMaxUses < 1) {
        throw new ValidationError('Invalid input parameters');
    }
    if (type === 'demo' && !demo_customer_name?.trim()) {
        throw new ValidationError('Customer name is required for demo keys');
    }

    const assignedKey = generateRandomKey();

    const key = await db.transaction(async (tx) => {
        // Non-SuperAdmins spend license credits (demo keys are free).
        if (user.role !== 'SuperAdmin' && type !== 'demo') {
            const credits = await repo.getUserCredits(tx, user.id);
            if (credits < normalizedMaxUses) {
                throw new AppError(
                    403,
                    'Credit Error',
                    `Insufficient license credits. You have ${credits} credits, but requested ${normalizedMaxUses} uses.`
                );
            }
            await repo.deductCredits(tx, user.id, normalizedMaxUses);
        }

        return repo.insertLicenseKey(tx, {
            key: assignedKey,
            type,
            maxUses: normalizedMaxUses,
            createdBy: user.id,
            expiresAt: expires_at ? new Date(expires_at) : null,
            demoCustomerName: demo_customer_name?.trim() || null,
            demoMaxRuns: type === 'demo' ? 1 : null,
        });
    });

    return { message: 'License key generated successfully', key };
}

export async function toggleLicense(user: AuthenticatedUser, input: ToggleLicenseInput) {
    const updated = await db.transaction((tx) =>
        repo.toggleActiveWithAudit(tx, {
            id: input.id,
            isActive: input.is_active,
            performedBy: user.id,
            restrictToCreator: user.role === 'SuperAdmin' ? null : user.id,
        })
    );

    if (!updated) {
        throw new NotFoundError('License key not found or not permitted');
    }
    return { message: 'License key updated', key: updated };
}
