import { db } from '@/lib/drizzle';
import { verifyPassword, hashPassword, generateToken } from '@/lib/auth';
import { AuthenticatedUser, getCreatableRoles } from '@/lib/auth-middleware';
import { buildFingerprint, isValidEmail } from '@/lib/platforms/windows/domain/fingerprint';
import { ValidationError, UnauthorizedError, ForbiddenError, ConflictError, AppError } from '@/lib/http/errors';
import { LoginInput, RegisterInput, LicenseActivateInput, TrialInput } from '@/lib/shared/domain/schemas/auth';
import { UserRole } from '@/lib/types';
import * as repo from '@/lib/shared/repositories/auth.repo';

const VALID_ROLES: UserRole[] = [
    'SuperAdmin', 'Employee', 'Refurbisher', 'Reseller', 'Technician', 'Enterprise', 'OEM', 'Insurer', 'Client',
];

export async function login(body: LoginInput) {
    const { identifier, password } = body;
    if (!identifier || !password) {
        throw new ValidationError('Username/email and password are required');
    }
    const user = await repo.findActiveUserByIdentifier(identifier.trim());
    if (!user || !(await verifyPassword(password, user.password_hash))) {
        throw new UnauthorizedError('Invalid credentials');
    }
    const token = generateToken({ userId: user.id, username: user.username, role: user.role });
    return { token, user: { id: user.id, username: user.username, role: user.role } };
}

export async function register(authUser: AuthenticatedUser, body: RegisterInput) {
    const { username, password, email, company_name, display_name, role } = body;

    if (!username || !password || !email) {
        throw new ValidationError('Username, password, and email are required');
    }
    if (!email.trim()) throw new ValidationError('Email is required');
    if (!role || !VALID_ROLES.includes(role as UserRole)) {
        throw new ValidationError('Valid role is required (SuperAdmin, Employee, Refurbisher, Reseller, Technician, Enterprise, OEM, Insurer, or Client)');
    }
    if (['Enterprise', 'OEM', 'Insurer', 'Refurbisher', 'Reseller'].includes(role) && !company_name?.trim()) {
        throw new ValidationError('Company name is required for Enterprise, OEM, Insurer, Refurbisher, and Reseller users');
    }

    const creatable = getCreatableRoles(authUser);
    if (!creatable.includes(role as UserRole)) {
        throw new ForbiddenError(`You can only create users with roles: ${creatable.join(', ')}`);
    }
    if (await repo.usernameExists(username)) {
        throw new ConflictError('Username already exists');
    }

    const passwordHash = await hashPassword(password);
    const user = await repo.insertUser({
        username,
        passwordHash,
        email: email || null,
        companyName: company_name?.trim() || null,
        displayName: display_name || username,
        role,
        createdBy: authUser.id,
    });
    return { message: 'User created successfully', user };
}

export async function activateLicense(body: LicenseActivateInput) {
    const { licenseKey, machineSerial, macAddress, computerName } = body;
    if (!licenseKey || !machineSerial) {
        throw new ValidationError('licenseKey and machineSerial are required');
    }
    const serial = String(machineSerial).trim();
    const platform = (body.platform || 'windows').trim().toLowerCase();
    const fingerprint = buildFingerprint(serial, macAddress, computerName);

    return db.transaction(async (tx) => {
        const license = await repo.findLicenseKeyByKey(tx, licenseKey);
        if (!license) throw new UnauthorizedError('Invalid license key');
        if (!license.is_active) throw new UnauthorizedError('This license key has been revoked');
        if (license.expires_at && new Date(license.expires_at) < new Date()) {
            throw new UnauthorizedError('This license key has expired');
        }
        if (license.type === 'demo' && license.demo_runs_used >= (license.demo_max_runs || 1)) {
            throw new UnauthorizedError('This demo key has already been used');
        }

        // Product scope: the key must cover the activating platform.
        const scope = license.product_scope ?? ['windows'];
        if (!scope.includes(platform) && !scope.includes('all')) {
            throw new ForbiddenError(`This license key is not valid for ${platform}`);
        }

        if (!(await repo.isMachineActivated(tx, license.id, serial))) {
            // Per-platform device cap (falls back to total max_uses for legacy keys).
            const caps = license.platform_caps ?? { [platform]: license.max_uses };
            const cap = caps[platform] ?? 0;
            const used = await repo.countActivationsByPlatform(tx, license.id, platform);
            if (used >= cap) {
                throw new UnauthorizedError(`This license key has reached its maximum ${platform} device activation limit`);
            }
            await repo.insertActivation(tx, license.id, serial, platform);
            await repo.incrementCurrentUses(tx, license.id);
        }

        const machineId = await repo.findOrCreateMachineByFingerprint(tx, fingerprint, serial, macAddress, computerName);

        // B2C customer-owned keys → restricted device token.
        if (license.customer_user_id) {
            const customer = await repo.findCustomer(tx, license.customer_user_id);
            if (!customer || customer.is_active !== true) {
                throw new UnauthorizedError('Customer account not found or inactive for this license key');
            }
            const token = generateToken({
                userId: -Math.abs(customer.id),
                username: customer.email,
                role: 'B2CDevice',
                scope: 'license_device',
                customerUserId: customer.id,
                machineId,
            });
            return { token, user: { id: -Math.abs(customer.id), username: customer.email, role: 'B2CDevice' }, machineId };
        }

        if (license.created_by == null) throw new UnauthorizedError('The creator of this license key no longer exists');
        const creator = await repo.findUserBasicTx(tx, license.created_by);
        if (!creator) throw new UnauthorizedError('The creator of this license key no longer exists');

        const token = generateToken({ userId: creator.id, username: creator.username, role: creator.role, machineId });
        return { token, user: { id: creator.id, username: creator.username, role: creator.role }, machineId };
    });
}

export async function activateTrial(body: TrialInput) {
    const { email, machineSerial, macAddress, computerName } = body;
    if (!email || !machineSerial) {
        throw new ValidationError('email and machineSerial are required');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
        throw new ValidationError('Please enter a valid email address');
    }
    const serial = String(machineSerial);
    const fingerprint = buildFingerprint(serial, macAddress, computerName);

    return db.transaction(async (tx) => {
        const existing = await repo.findTrialByFingerprint(tx, fingerprint);
        if (existing) {
            if (new Date(existing.trial_end_utc) <= new Date() || !existing.is_active) {
                throw new AppError(403, 'Trial Error', 'Your 7-day free trial has expired. Please purchase a license key to continue.');
            }
            const machineDbId = existing.machine_id
                ?? await repo.findOrCreateMachineByFingerprint(tx, fingerprint, serial, macAddress, computerName);
            const token = generateToken({ userId: 0, username: existing.email, role: 'TrialUser', scope: 'license_device' });
            return { token, user: { id: 0, username: existing.email, role: 'TrialUser' }, machineId: machineDbId, trialEndsAt: existing.trial_end_utc };
        }

        if (await repo.isEmailBlocked(tx, normalizedEmail)) {
            throw new AppError(409, 'Trial Error', 'This email address has already been used for a free trial on another device.');
        }

        const machineDbId = await repo.findOrCreateMachineByFingerprint(tx, fingerprint, serial, macAddress, computerName);
        const newTrial = await repo.insertTrial(tx, {
            email: normalizedEmail,
            fingerprint,
            machineSerial: serial,
            macAddress: macAddress ?? null,
            computerName: computerName ?? null,
            machineId: machineDbId,
        });
        await repo.blockEmail(tx, normalizedEmail, newTrial.id);

        const token = generateToken({ userId: 0, username: normalizedEmail, role: 'TrialUser', scope: 'license_device' });
        return { token, user: { id: 0, username: normalizedEmail, role: 'TrialUser' }, machineId: machineDbId, trialEndsAt: newTrial.trial_end_utc };
    });
}
