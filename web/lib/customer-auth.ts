import jwt from 'jsonwebtoken';

const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || 'customer-secret-change-in-production';
const CUSTOMER_JWT_EXPIRES_IN = '30d';

export interface CustomerJwtPayload {
    customerId: number;
    email: string;
    scope: 'customer';
}

export function generateCustomerToken(payload: Omit<CustomerJwtPayload, 'scope'>): string {
    return jwt.sign(
        { ...payload, scope: 'customer' } satisfies CustomerJwtPayload,
        CUSTOMER_JWT_SECRET,
        { expiresIn: CUSTOMER_JWT_EXPIRES_IN }
    );
}

export function verifyCustomerToken(token: string): CustomerJwtPayload | null {
    try {
        const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET) as CustomerJwtPayload;
        if (decoded.scope !== 'customer') return null;
        return decoded;
    } catch {
        return null;
    }
}

export function extractBearerToken(authHeader?: string | null): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.substring(7);
}
