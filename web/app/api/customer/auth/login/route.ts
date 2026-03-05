import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { generateCustomerToken } from '@/lib/customer-auth';

type CustomerRow = {
    id: number;
    email: string;
    password_hash: string;
    full_name: string | null;
    is_active: boolean;
};

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const email = String(body?.email || '').trim().toLowerCase();
        const password = String(body?.password || '');

        if (!email || !password) {
            return NextResponse.json({ error: 'Validation Error', message: 'Email and password are required' }, { status: 400 });
        }

        const customers = await query<CustomerRow>(
            'SELECT * FROM customer_users WHERE email = $1 AND is_active = true',
            [email]
        );

        if (customers.length === 0) {
            return NextResponse.json({ error: 'Authentication Error', message: 'Invalid credentials' }, { status: 401 });
        }

        const customer = customers[0];
        const valid = await verifyPassword(password, customer.password_hash);
        if (!valid) {
            return NextResponse.json({ error: 'Authentication Error', message: 'Invalid credentials' }, { status: 401 });
        }

        const token = generateCustomerToken({
            customerId: customer.id,
            email: customer.email,
        });

        return NextResponse.json({
            token,
            customer: {
                id: customer.id,
                email: customer.email,
                fullName: customer.full_name,
            },
        });
    } catch (error) {
        console.error('Customer login error:', error);
        return NextResponse.json({ error: 'Server Error', message: 'Failed to login' }, { status: 500 });
    }
}
