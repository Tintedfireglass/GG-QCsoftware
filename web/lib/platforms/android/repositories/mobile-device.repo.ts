import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { mobileDevices } = schema;

export interface DeviceUpsert {
    customerUserId: number;
    deviceId: string;
    model?: string | null;
    manufacturer?: string | null;
    brand?: string | null;
    os?: string | null;
    androidVersion?: string | null;
    apiLevel?: number | null;
    processor?: string | null;
    serialNumber?: string | null;
    ram?: string | null;
    storage?: string | null;
    infoJson: unknown; // full snapshot, verbatim
}

/** Upsert a device by (customerUserId, deviceId). Returns the row id + savedAt. */
export async function upsertDevice(v: DeviceUpsert): Promise<{ id: number; saved_at: string }> {
    const values = {
        customerUserId: v.customerUserId,
        deviceId: v.deviceId,
        model: v.model ?? null,
        manufacturer: v.manufacturer ?? null,
        brand: v.brand ?? null,
        os: v.os ?? null,
        androidVersion: v.androidVersion ?? null,
        apiLevel: v.apiLevel ?? null,
        processor: v.processor ?? null,
        serialNumber: v.serialNumber ?? null,
        ram: v.ram ?? null,
        storage: v.storage ?? null,
        infoJson: v.infoJson,
        lastSeenAt: sql`now()`,
    };
    const rows = await db
        .insert(mobileDevices)
        .values(values)
        .onConflictDoUpdate({
            target: [mobileDevices.customerUserId, mobileDevices.deviceId],
            set: { ...values, updatedAt: sql`now()` },
        })
        .returning({ id: mobileDevices.id, saved_at: mobileDevices.updatedAt });
    return rows[0];
}
