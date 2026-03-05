import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { extractBearerToken, verifyCustomerToken } from '@/lib/customer-auth';

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

        const customers = await query<{ id: number; email: string; full_name: string | null }>(
            'SELECT id, email, full_name FROM customer_users WHERE id = $1 AND is_active = true',
            [decoded.customerId]
        );

        if (customers.length === 0) {
            return NextResponse.json({ error: 'Not Found', message: 'Customer not found' }, { status: 404 });
        }

        return NextResponse.json({
            customer: {
                id: customers[0].id,
                email: customers[0].email,
                fullName: customers[0].full_name,
            },
        });
    } catch (error) {
        console.error('Customer me error:', error);
        return NextResponse.json({ error: 'Server Error', message: 'Failed to fetch customer profile' }, { status: 500 });
    }
}
