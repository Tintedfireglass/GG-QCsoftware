import { NextRequest } from 'next/server';
import { extractBearerToken, verifyCustomerToken } from '@/lib/customer-auth';
import { UnauthorizedError } from './errors';

export interface CustomerPrincipal {
    customerId: number;
    email: string;
    phone?: string;
}

/** Authenticate a B2C customer request via the customer JWT, or throw 401. */
export function requireCustomer(request: NextRequest): CustomerPrincipal {
    const token = extractBearerToken(request.headers.get('authorization'));
    if (!token) throw new UnauthorizedError('Missing token');
    const decoded = verifyCustomerToken(token);
    if (!decoded) throw new UnauthorizedError('Invalid token');
    // email is optional for phone+OTP app users; default to '' to keep the shape.
    return { customerId: decoded.customerId, email: decoded.email ?? '', phone: decoded.phone };
}
