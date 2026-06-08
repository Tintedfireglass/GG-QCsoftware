import { createHash, randomInt } from 'crypto';
import { generateCustomerToken } from '@/lib/customer-auth';
import { MobileError } from '@/lib/platforms/android/http';
import { sendOtpSms } from '@/lib/shared/sms/sms-sender';
import * as repo from '@/lib/platforms/android/repositories/mobile-auth.repo';

const OTP_SECRET = process.env.OTP_SECRET || process.env.JWT_SECRET || 'otp-secret-change-in-production';
const OTP_TTL_MIN = 10; // matches the SMS template wording ("valid for the next 10 minutes")
const OTP_MAX_ATTEMPTS = 5;
const OTP_THROTTLE_WINDOW_MIN = 10;
const OTP_THROTTLE_MAX = 5; // max OTPs per phone per window
const isProd = process.env.NODE_ENV === 'production';

function hashOtp(phone: string, otp: string): string {
    return createHash('sha256').update(`${phone}:${otp}:${OTP_SECRET}`).digest('hex');
}

/** "DD/MM/YYYY" → "YYYY-MM-DD" (ISO date), or null if not a valid date. */
function parseDob(input?: string): string | null {
    if (!input) return null;
    const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? iso : null;
}

/**
 * Request a login OTP, delivered via the active SMS provider (MSG91 today; see
 * SMS Settings / sms-sender). In non-prod the code is also returned as `devOtp`
 * so the app can be tested without a live SMS account. In production a failed
 * send is fatal (so the misconfiguration surfaces instead of stranding users).
 */
export async function requestOtp(phone: string, countryCode?: string) {
    const recent = await repo.countRecentOtps(phone, OTP_THROTTLE_WINDOW_MIN);
    if (recent >= OTP_THROTTLE_MAX) {
        throw new MobileError(429, 'OTP_RATE_LIMITED', 'Too many OTP requests. Try again later.');
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();
    await repo.insertOtp(phone, hashOtp(phone, otp), expiresAt);

    const delivered = await sendOtpSms(phone, otp, countryCode);
    if (!isProd) console.log(`[mobile-otp] ${phone} → ${otp}`);
    if (isProd && !delivered) {
        throw new MobileError(502, 'OTP_SEND_FAILED', 'Could not send the OTP right now. Please try again shortly.');
    }

    return {
        message: 'OTP sent',
        data: {
            otpSent: true,
            expiresInSeconds: OTP_TTL_MIN * 60,
            ...(isProd ? {} : { devOtp: otp }),
        },
    };
}

export interface VerifyOtpInput {
    phone: string;
    otp: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    dateOfBirth?: string;
    countryCode?: string;
}

export async function verifyOtp(input: VerifyOtpInput) {
    const { phone, otp } = input;
    const row = await repo.findLatestOtp(phone);
    if (!row) throw new MobileError(400, 'OTP_NOT_FOUND', 'No active OTP for this number. Request a new one.');
    if (new Date(row.expires_at) < new Date()) throw new MobileError(400, 'OTP_EXPIRED', 'OTP has expired. Request a new one.');
    if (row.attempts >= OTP_MAX_ATTEMPTS) throw new MobileError(429, 'OTP_LOCKED', 'Too many incorrect attempts. Request a new OTP.');

    if (row.code_hash !== hashOtp(phone, otp)) {
        await repo.incrementOtpAttempts(row.id);
        throw new MobileError(401, 'OTP_INVALID', 'Incorrect OTP.');
    }
    await repo.consumeOtp(row.id);

    let customer = await repo.findCustomerByPhone(phone);
    const isNewUser = !customer;
    if (!customer) {
        customer = await repo.createCustomerFromPhone({
            phone,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            dateOfBirth: parseDob(input.dateOfBirth),
            countryCode: input.countryCode,
        });
    }

    const token = generateCustomerToken({ customerId: customer.id, email: customer.email ?? undefined, phone });
    return {
        data: {
            userId: `usr_${customer.id}`,
            phone,
            isNewUser,
            token,
            // 30-day token (CUSTOMER_JWT_EXPIRES_IN); refresh flow not implemented yet.
            refreshToken: token,
            expiresIn: 30 * 24 * 60 * 60,
        },
    };
}

export async function getProfile(customerId: number) {
    const p = await repo.getProfile(customerId);
    if (!p) throw new MobileError(404, 'NOT_FOUND', 'Profile not found');
    return {
        data: {
            userId: `usr_${p.id}`,
            firstName: p.first_name ?? null,
            lastName: p.last_name ?? null,
            fullName: p.full_name ?? null,
            email: p.email ?? null,
            phone: p.phone ?? null,
            dateOfBirth: p.date_of_birth ?? null,
            countryCode: p.country_code ?? null,
            createdAt: p.created_at ?? null,
            totalReports: Number(p.total_reports ?? 0),
        },
    };
}

export interface UpdateProfileInput {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    dateOfBirth?: string;
    countryCode?: string;
}

export async function updateProfile(customerId: number, input: UpdateProfileInput) {
    await repo.updateProfile(customerId, {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email,
        dateOfBirth: input.dateOfBirth !== undefined ? parseDob(input.dateOfBirth) : undefined,
        countryCode: input.countryCode,
    });
    const updated = await getProfile(customerId);
    return { message: 'Profile updated successfully', data: updated.data };
}

export async function deleteAccount(customerId: number) {
    await repo.deactivateCustomer(customerId);
    return { message: 'Account deleted permanently' };
}
