import { db, type Tx } from '@/lib/drizzle';
import { ValidationError, NotFoundError, ConflictError } from '@/lib/http/errors';
import { CreateCouponInput, UpdateCouponInput } from '@/lib/shared/domain/schemas/coupons';
import * as repo from '@/lib/shared/repositories/coupons.repo';
import * as plansRepo from '@/lib/shared/repositories/plans.repo';
import { computePlanPricing } from '@/lib/shared/services/pricing';

// ── Admin CRUD ──

export async function listCoupons() {
    return { coupons: await repo.listCoupons() };
}

/** Shared field normalization + rule checks for create/update. */
function buildFields(input: CreateCouponInput): repo.CouponFields {
    const discountType = input.discount_type;
    if (discountType === 'percent' && (input.discount_value < 1 || input.discount_value > 100)) {
        throw new ValidationError('Percent discount must be between 1 and 100');
    }
    if (discountType === 'fixed' && input.discount_value < 1) {
        throw new ValidationError('Fixed discount amount must be at least 1');
    }
    const maxDiscountCents = discountType === 'percent' ? (input.max_discount_cents ?? null) : null;
    const currency = discountType === 'fixed' && input.currency ? input.currency.toUpperCase() : null;

    if (input.valid_from && input.valid_until && new Date(input.valid_from) > new Date(input.valid_until)) {
        throw new ValidationError('valid_from must be before valid_until');
    }

    return {
        code: input.code.trim().toUpperCase(),
        description: input.description ?? null,
        discountType,
        discountValue: input.discount_value,
        maxDiscountCents,
        currency,
        minOrderCents: input.min_order_cents ?? 0,
        maxRedemptions: input.max_redemptions ?? null,
        perCustomerLimit: input.per_customer_limit === undefined ? 1 : input.per_customer_limit,
        applicablePlanIds: input.applicable_plan_ids && input.applicable_plan_ids.length > 0 ? input.applicable_plan_ids : null,
        validFrom: input.valid_from ?? null,
        validUntil: input.valid_until ?? null,
        isActive: input.is_active ?? true,
        isPublic: input.is_public ?? false,
    };
}

export async function createCoupon(input: CreateCouponInput) {
    const fields = buildFields(input);
    const existing = await repo.findCouponByCode(db, fields.code);
    if (existing) throw new ConflictError('A coupon with this code already exists');
    const coupon = await repo.insertCoupon(fields);
    return { message: 'Coupon created', coupon };
}

export async function updateCoupon(id: number, input: UpdateCouponInput) {
    // Validate by merging onto a full shape, but only persist provided fields.
    const partial: Partial<repo.CouponFields> = {};

    if (input.discount_type !== undefined) partial.discountType = input.discount_type;
    if (input.discount_value !== undefined) partial.discountValue = input.discount_value;
    const type = input.discount_type;
    if (type === 'percent' && input.discount_value !== undefined && (input.discount_value < 1 || input.discount_value > 100)) {
        throw new ValidationError('Percent discount must be between 1 and 100');
    }
    if (input.max_discount_cents !== undefined) partial.maxDiscountCents = input.max_discount_cents ?? null;
    if (input.currency !== undefined) partial.currency = input.currency ? input.currency.toUpperCase() : null;
    if (input.code !== undefined) {
        const code = input.code.trim().toUpperCase();
        const clash = await repo.findCouponByCode(db, code);
        if (clash && (clash.id as number) !== id) throw new ConflictError('A coupon with this code already exists');
        partial.code = code;
    }
    if (input.description !== undefined) partial.description = input.description ?? null;
    if (input.min_order_cents !== undefined) partial.minOrderCents = input.min_order_cents;
    if (input.max_redemptions !== undefined) partial.maxRedemptions = input.max_redemptions ?? null;
    if (input.per_customer_limit !== undefined) partial.perCustomerLimit = input.per_customer_limit ?? null;
    if (input.applicable_plan_ids !== undefined) {
        partial.applicablePlanIds = input.applicable_plan_ids && input.applicable_plan_ids.length > 0 ? input.applicable_plan_ids : null;
    }
    if (input.valid_from !== undefined) partial.validFrom = input.valid_from ?? null;
    if (input.valid_until !== undefined) partial.validUntil = input.valid_until ?? null;
    if (input.is_active !== undefined) partial.isActive = input.is_active;
    if (input.is_public !== undefined) partial.isPublic = input.is_public;

    const updated = await repo.updateCoupon(id, partial);
    if (!updated) throw new NotFoundError('Coupon not found');
    return { message: 'Coupon updated', coupon: updated };
}

export async function deleteCoupon(id: number) {
    const ok = await repo.deleteCoupon(id);
    if (!ok) throw new NotFoundError('Coupon not found');
    return { message: 'Coupon deleted' };
}

// ── Validation / discount math (shared by storefront preview + checkout) ──

interface CouponRow {
    id: number;
    code: string;
    discount_type: string;
    discount_value: number;
    max_discount_cents: number | null;
    currency: string | null;
    min_order_cents: number;
    max_redemptions: number | null;
    times_redeemed: number;
    per_customer_limit: number | null;
    applicable_plan_ids: number[] | null;
    valid_from: string | null;
    valid_until: string | null;
    is_active: boolean;
}

export interface CouponEvaluation {
    couponId: number;
    code: string;
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
}

/**
 * Resolve a coupon for a given plan + customer, enforce all rules, and compute
 * the discount. Throws ValidationError when the code can't be applied.
 * Runs inside the caller's tx when supplied (checkout); otherwise uses db.
 */
export async function evaluateCoupon(
    code: string,
    plan: { id: number; price_cents: number; currency: string },
    customerId: number,
    tx: Tx | typeof db = db,
): Promise<CouponEvaluation> {
    const raw = await repo.findCouponByCode(tx, code);
    if (!raw) throw new ValidationError('Invalid coupon code');
    const c = raw as unknown as CouponRow;

    if (!c.is_active) throw new ValidationError('This coupon is no longer active');

    const now = new Date();
    if (c.valid_from && now < new Date(c.valid_from)) throw new ValidationError('This coupon is not active yet');
    if (c.valid_until && now > new Date(c.valid_until)) throw new ValidationError('This coupon has expired');

    if (c.applicable_plan_ids && c.applicable_plan_ids.length > 0 && !c.applicable_plan_ids.includes(plan.id)) {
        throw new ValidationError('This coupon does not apply to the selected plan');
    }

    const subtotal = plan.price_cents;
    if (subtotal < c.min_order_cents) {
        throw new ValidationError(`This coupon requires a minimum order of ${(c.min_order_cents / 100).toFixed(2)}`);
    }

    if (c.max_redemptions != null && c.times_redeemed >= c.max_redemptions) {
        throw new ValidationError('This coupon has reached its redemption limit');
    }

    // Per-customer limit can only be enforced for a known customer. customerId <= 0
    // (anonymous storefront preview) skips it; checkout re-checks with the real id.
    if (c.per_customer_limit != null && customerId > 0) {
        const used = await repo.countCustomerRedemptions(tx, c.id, customerId);
        if (used >= c.per_customer_limit) throw new ValidationError('You have already used this coupon');
    }

    if (c.discount_type === 'fixed' && c.currency && c.currency.toUpperCase() !== plan.currency.toUpperCase()) {
        throw new ValidationError('This coupon is not valid for this plan currency');
    }

    let discount = c.discount_type === 'percent'
        ? Math.floor((subtotal * c.discount_value) / 100)
        : c.discount_value;
    if (c.discount_type === 'percent' && c.max_discount_cents != null) {
        discount = Math.min(discount, c.max_discount_cents);
    }
    discount = Math.max(0, Math.min(discount, subtotal)); // never negative, never above subtotal

    return { couponId: c.id, code: c.code, subtotalCents: subtotal, discountCents: discount, totalCents: subtotal - discount };
}

/** Storefront preview: POST /api/customer/coupons/validate. */
export async function previewCoupon(code: string, planId: number, customerId: number) {
    const plan = await plansRepo.findPlanById(db, planId);
    if (!plan || !plan.is_active) throw new NotFoundError('Plan not found or inactive');
    const eval_ = await evaluateCoupon(code, plan, customerId);
    return {
        valid: true,
        code: eval_.code,
        subtotal_cents: eval_.subtotalCents,
        discount_cents: eval_.discountCents,
        total_cents: eval_.totalCents,
        currency: plan.currency,
    };
}

/**
 * Anonymous (guest) preview for the store website. Applies quantity to the
 * subtotal and skips the per-customer limit (re-checked at checkout). Per-customer
 * enforcement happens once the buyer's email resolves to a real account.
 */
export async function previewCouponPublic(code: string, planId: number, quantity = 1, platformCaps?: Record<string, number> | null) {
    const plan = await plansRepo.findPlanById(db, planId);
    if (!plan || !plan.is_active) throw new NotFoundError('Plan not found or inactive');
    const qty = Math.max(1, Math.floor(quantity || 1));
    // Match the checkout's pricing: per-device when caps are given, else quantity.
    const pricing = computePlanPricing(plan, { quantity: qty, platformCaps: platformCaps ?? null });
    const eval_ = await evaluateCoupon(code, { ...plan, price_cents: pricing.amountCents }, 0);
    return {
        valid: true,
        code: eval_.code,
        quantity: qty,
        subtotal_cents: eval_.subtotalCents,
        discount_cents: eval_.discountCents,
        total_cents: eval_.totalCents,
        currency: plan.currency,
    };
}

interface PublicCouponRow {
    code: string;
    description: string | null;
    discount_type: string;
    discount_value: number;
    max_discount_cents: number | null;
    currency: string | null;
    min_order_cents: number;
}

/** Coupons to advertise on the storefront for a plan (admin-flagged, currently valid). */
export async function listPublicCoupons(planId: number) {
    const rows = (await repo.listPublicCoupons(planId)) as unknown as PublicCouponRow[];
    const coupons = rows.map((c) => {
        const off = c.discount_type === 'percent'
            ? `${c.discount_value}% off`
            : `${(c.currency || '').toUpperCase()} ${(c.discount_value / 100).toLocaleString()} off`.trim();
        return {
            code: c.code,
            description: c.description,
            discount_type: c.discount_type,
            discount_value: c.discount_value,
            max_discount_cents: c.max_discount_cents,
            min_order_cents: c.min_order_cents,
            label: off,
        };
    });
    return { coupons };
}
