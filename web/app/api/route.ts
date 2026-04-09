import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
    try {
        // Test database connection
        const result = await query('SELECT NOW() as current_time, version() as pg_version');

        return NextResponse.json({
            status: 'OK',
            message: 'API is running',
            database: {
                connected: true,
                currentTime: result[0]?.current_time,
                version: result[0]?.pg_version,
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
    } catch (error: any) {
        return NextResponse.json(
            {
                status: 'ERROR',
                message: 'Database connection failed',
                error: error.message,
                hint: 'Make sure your DATABASE_URL is set correctly in .env.local',
            },
            { status: 500 }
        );
    }
}
