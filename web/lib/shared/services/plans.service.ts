import { ValidationError, NotFoundError } from '@/lib/http/errors';
import { CreatePlanInput, UpdatePlanInput } from '@/lib/shared/domain/schemas/plans';
import * as repo from '@/lib/shared/repositories/plans.repo';

/** product_scope and platform_caps must describe the same set of platforms. */
function assertScopeMatchesCaps(scope: string[], caps: Record<string, number>) {
    const capKeys = Object.keys(caps);
    if (capKeys.length === 0) throw new ValidationError('platform_caps cannot be empty');
    const scopeSet = new Set(scope);
    const capSet = new Set(capKeys);
    if (scopeSet.size !== capSet.size || scope.some((p) => !capSet.has(p))) {
        throw new ValidationError('platform_caps keys must match product_scope exactly');
    }
}

export async function listPlans(includeInactive: boolean) {
    return { plans: await repo.listPlans(includeInactive) };
}

export async function createPlan(input: CreatePlanInput) {
    assertScopeMatchesCaps(input.product_scope, input.platform_caps);

    const durationDays = input.duration_days ?? null;
    // Auto-renew is only meaningful for finite-duration plans.
    const allowAutoRenew = (input.allow_auto_renew ?? false) && durationDays != null;

    const plan = await repo.insertPlan({
        name: input.name,
        description: input.description ?? null,
        billingType: 'one_time',
        interval: null,
        priceCents: input.price_cents,
        currency: (input.currency || 'INR').toUpperCase(),
        productScope: input.product_scope,
        platformCaps: input.platform_caps,
        durationDays,
        features: (input.features ?? []).map((f) => f.trim()).filter(Boolean),
        allowAutoRenew,
        isActive: input.is_active ?? true,
        sortOrder: input.sort_order ?? 0,
    });
    return { message: 'Plan created', plan };
}

export async function updatePlan(id: number, input: UpdatePlanInput) {
    // When either scope or caps changes, both must be supplied so we can re-check consistency.
    if (input.product_scope !== undefined || input.platform_caps !== undefined) {
        if (input.product_scope === undefined || input.platform_caps === undefined) {
            throw new ValidationError('Provide both product_scope and platform_caps together when changing either');
        }
        assertScopeMatchesCaps(input.product_scope, input.platform_caps);
    }

    const updated = await repo.updatePlan(id, {
        name: input.name,
        description: input.description,
        priceCents: input.price_cents,
        currency: input.currency ? input.currency.toUpperCase() : undefined,
        productScope: input.product_scope,
        platformCaps: input.platform_caps,
        durationDays: input.duration_days,
        features: input.features ? input.features.map((f) => f.trim()).filter(Boolean) : undefined,
        allowAutoRenew: input.allow_auto_renew,
        isActive: input.is_active,
        sortOrder: input.sort_order,
    });
    if (!updated) throw new NotFoundError('Plan not found');
    return { message: 'Plan updated', plan: updated };
}

export async function deletePlan(id: number) {
    const ok = await repo.deletePlan(id);
    if (!ok) throw new NotFoundError('Plan not found');
    return { message: 'Plan deleted' };
}
