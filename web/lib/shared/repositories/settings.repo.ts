import { db } from '@/lib/drizzle';
import { appSettings } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

/** Read a settings category blob (e.g. 'general'). Null if never saved. */
export async function getSetting(key: string): Promise<Record<string, any> | null> {
    const [row] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, key))
        .limit(1);
    return (row?.value as Record<string, any>) ?? null;
}

/** Upsert a settings category blob. */
export async function setSetting(key: string, value: Record<string, any>): Promise<Record<string, any>> {
    const [row] = await db
        .insert(appSettings)
        .values({ key, value })
        .onConflictDoUpdate({
            target: appSettings.key,
            set: { value, updatedAt: new Date().toISOString() },
        })
        .returning();
    return row.value as Record<string, any>;
}
