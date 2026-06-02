import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/drizzle';

export async function GET() {
    try {
        const { rows } = await db.execute(sql`SELECT NOW() as current_time, version() as pg_version`);
        const row = rows[0] as { current_time?: unknown; pg_version?: unknown } | undefined;

        return NextResponse.json({
            status: 'OK',
            message: 'API is running',
            database: {
                connected: true,
                currentTime: row?.current_time,
                version: row?.pg_version,
            },
            endpoints: {
                auth: {
                    login: 'POST /api/auth/login',
                    register: 'POST /api/auth/register',
                },
                qcResults: {
                    list: 'GET /api/qc-results (JWT required)',
                    get: 'GET /api/qc-results/[id] (JWT required)',
                    submit: 'POST /api/qc-results (API key + JWT required)',
                },
                machines: {
                    list: 'GET /api/machines (JWT required)',
                    get: 'GET /api/machines/[id] (JWT required)',
                },
            },
        });
    } catch (error) {
        return NextResponse.json(
            {
                status: 'ERROR',
                message: 'Database connection failed',
                error: error instanceof Error ? error.message : String(error),
                hint: 'Make sure your DATABASE_URL is set correctly in .env.local',
            },
            { status: 500 }
        );
    }
}
