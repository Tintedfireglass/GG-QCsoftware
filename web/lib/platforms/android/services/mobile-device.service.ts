import * as repo from '@/lib/platforms/android/repositories/mobile-device.repo';
import type { deviceInfoSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import type { z } from 'zod';

type DeviceInfoInput = z.infer<typeof deviceInfoSchema>;

/** Upsert the device record from a device/info submission. Stores the full body. */
export async function saveDeviceInfo(customerId: number, body: DeviceInfoInput) {
    const saved = await repo.upsertDevice({
        customerUserId: customerId,
        deviceId: body.deviceId,
        model: body.model,
        manufacturer: body.manufacturer,
        brand: body.brand ?? null,
        os: body.os ?? null,
        androidVersion: body.androidVersion ?? null,
        apiLevel: body.apiLevel ?? null,
        processor: body.processor ?? null,
        serialNumber: body.serialNumber ?? null,
        ram: body.ram ?? null,
        storage: body.storage ?? null,
        infoJson: body, // full snapshot, verbatim
    });

    return {
        message: 'Device info saved',
        data: { deviceRecordId: `dev_${saved.id}`, savedAt: saved.saved_at },
    };
}
