import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/drizzle';

const { machines } = schema;

export async function machineExists(machineId: number): Promise<boolean> {
    const rows = await db.select({ id: machines.id }).from(machines).where(eq(machines.id, machineId)).limit(1);
    return rows.length > 0;
}

export async function touchMachine(machineId: number): Promise<void> {
    await db.update(machines).set({ lastSeen: sql`NOW()` }).where(eq(machines.id, machineId));
}

/** Insert a server-health report. `machine_health_reports` is not in the Drizzle
 *  schema (added by migration 023), so this uses a raw statement via db.execute. */
export async function insertHealthReport(v: {
    machineId: number;
    status: string;
    collectedAt: Date | null;
    agentVersion: string | null;
    reportJson: string;
}): Promise<{ id: number; created_at: string } | undefined> {
    const { rows } = await db.execute(sql`
        INSERT INTO machine_health_reports (machine_id, status, collected_at, agent_version, report_json)
        VALUES (${v.machineId}, ${v.status}, ${v.collectedAt ? v.collectedAt.toISOString() : null}, ${v.agentVersion}, ${v.reportJson}::jsonb)
        RETURNING id, created_at`);
    return rows[0] as { id: number; created_at: string } | undefined;
}
