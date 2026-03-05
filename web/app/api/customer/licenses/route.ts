import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { extractBearerToken, verifyCustomerToken } from '@/lib/customer-auth';

type CustomerLicense = {
    id: number;
    key: string;
    is_active: boolean;
    expires_at: string | null;
    created_at: string;
    plan: string | null;
    payment_reference: string | null;
};

export async function GET(request: NextRequest) {
    try {
        const token = extractBearerToken(request.headers.get('authorization'));
        if (!token) {
            return NextResponse.json({ error: 'Authentication Error', message: 'Missing token' }, { status: 401 });
        }

        const decoded = verifyCustomerToken(token);
        if (!decoded) {
            return NextResponse.json({ error: 'Authentication Error', message: 'Invalid token' }, { status: 401 });
        }

        const licenses = await query<CustomerLicense>(
            `SELECT
                lk.id,
                lk.key,
                lk.is_active,
                lk.expires_at,
                lk.created_at,
                co.plan,
                co.payment_reference
             FROM license_keys lk
             LEFT JOIN customer_orders co ON co.generated_license_key_id = lk.id
             WHERE lk.customer_user_id = $1
             ORDER BY lk.created_at DESC`,
            [decoded.customerId]
        );

        return NextResponse.json({ licenses });
    } catch (error) {
        console.error('Customer licenses error:', error);
        return NextResponse.json({ error: 'Server Error', message: 'Failed to fetch licenses' }, { status: 500 });
    }
}
