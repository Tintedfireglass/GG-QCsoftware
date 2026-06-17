import { db } from '@/lib/drizzle';
import { MobileError } from '@/lib/platforms/android/http';
import * as authRepo from '@/lib/shared/repositories/auth.repo';
import * as licenseRepo from '@/lib/platforms/android/repositories/mobile-license.repo';

const PLATFORM = 'android';

/**
 * Activate a license key for the signed-in customer's device. Mirrors the PC
 * /api/auth/license flow (scope + per-platform device cap) but records the
 * activation under platform='android' keyed by deviceId.
 */
export async function activate(customerId: number, key: string, deviceId: string) {
    return db.transaction(async (tx) => {
        const lic = await authRepo.findLicenseKeyByKey(tx, key);
        if (!lic) throw new MobileError(404, 'LICENSE_NOT_FOUND', 'Invalid license key');
        if (!lic.is_active) throw new MobileError(403, 'LICENSE_REVOKED', 'This license key has been revoked');
        if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
            throw new MobileError(403, 'LICENSE_EXPIRED', 'This license key has expired');
        }
        // A customer-owned key may only be activated by its owner.
        if (lic.customer_user_id != null && lic.customer_user_id !== customerId) {
            throw new MobileError(403, 'LICENSE_NOT_YOURS', 'This license key belongs to another account');
        }
        const scope = lic.product_scope ?? ['windows'];
        if (!scope.includes(PLATFORM) && !scope.includes('all')) {
            throw new MobileError(403, 'LICENSE_PLATFORM_MISMATCH', 'This license key is not valid for Android');
        }

        const caps = lic.platform_caps ?? { [PLATFORM]: lic.max_uses };
        const cap = caps[PLATFORM] ?? caps['all'] ?? 0;
        const already = await authRepo.isMachineActivated(tx, lic.id, deviceId);
        let used = await authRepo.countActivationsByPlatform(tx, lic.id, PLATFORM);

        if (!already) {
            if (used >= cap) {
                throw new MobileError(403, 'LICENSE_DEVICE_LIMIT', 'This license key has reached its maximum Android device activations');
            }
            await authRepo.insertActivation(tx, lic.id, deviceId, PLATFORM);
            await authRepo.incrementCurrentUses(tx, lic.id);
            used += 1;
        }

        // Bind an unowned key to this customer so status/entitlement queries (which key off
        // customer_user_id) can find it on later app restarts. No-op if already owned.
        if (lic.customer_user_id == null) {
            await authRepo.claimLicenseForCustomer(tx, lic.id, customerId);
        }

        return {
            message: already ? 'Device already activated' : 'License activated',
            data: {
                valid: true,
                key,
                deviceId,
                expiresAt: lic.expires_at ?? null,
                deviceCap: cap,
                devicesUsed: used,
                alreadyActivated: already,
            },
        };
    });
}

/** Entitlement status for the signed-in customer (and optionally a specific device). */
export async function status(customerId: number, deviceId?: string) {
    const [licenses, deviceActivated] = await Promise.all([
        licenseRepo.listAndroidLicenses(customerId),
        deviceId ? licenseRepo.isDeviceActivated(customerId, deviceId) : Promise.resolve(false),
    ]);

    const now = new Date();
    const active = licenses.some(
        (l) => l.is_active === true && (!l.expires_at || new Date(l.expires_at as string) > now)
    );

    return {
        data: {
            active,
            deviceActivated,
            licenses: licenses.map((l) => ({
                key: l.key,
                type: l.type,
                isActive: l.is_active === true,
                expiresAt: l.expires_at ?? null,
                deviceCap: Number(l.android_cap ?? 0),
                devicesUsed: Number(l.android_used ?? 0),
            })),
        },
    };
}
