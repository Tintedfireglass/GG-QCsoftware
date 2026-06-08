import { db } from '@/lib/drizzle';
import * as repo from '@/lib/shared/repositories/renewals.repo';
import * as customerRepo from '@/lib/shared/repositories/customer.repo';
import * as plansRepo from '@/lib/shared/repositories/plans.repo';
import { chargeRecurring } from '@/lib/shared/services/payment.service';
import { logger } from '@/lib/logger';

const DAY_MS = 86_400_000;

/**
 * Charge due auto-renewal mandates and extend their licenses.
 * Intended to be invoked on a schedule (cron) or manually by an admin.
 */
export async function runDueRenewals(withinDays = 1) {
    const due = await repo.findDueRenewals(withinDays);
    let renewed = 0, failed = 0, skipped = 0;

    for (const d of due) {
        if (!d.customer_user_id || !d.email) { skipped++; continue; }

        const plan = await plansRepo.findPlanById(db, d.renewal_plan_id);
        if (!plan || !plan.is_active || plan.duration_days == null) { skipped++; continue; }

        const orderId = await customerRepo.createOrder({
            customerId: d.customer_user_id,
            plan: plan.name,
            planId: plan.id,
            amountCents: plan.price_cents,
            currency: plan.currency,
            checkoutState: `renewal-${d.key_id}-${plan.id}`,
            autoRenew: true,
            isRenewal: true,
            status: 'pending',
        });

        const charge = await chargeRecurring({
            customerRef: d.gateway_customer_ref,
            tokenRef: d.gateway_token_ref,
            amountCents: plan.price_cents,
            currency: plan.currency,
            customerEmail: d.email,
            description: `Auto-renewal: ${plan.name}`,
        });

        if (charge.success) {
            // Extend from the later of current expiry or now (avoid shortening on early runs).
            const base = new Date(d.expires_at) > new Date() ? new Date(d.expires_at) : new Date();
            const newExpiry = new Date(base.getTime() + plan.duration_days * DAY_MS);
            await repo.extendKeyExpiry(d.key_id, newExpiry);
            await repo.markRenewalPaid(orderId, charge.gatewayRef ?? '', d.key_id);
            renewed++;
        } else {
            await repo.markRenewalFailed(orderId);
            logger.warn('autorenew.charge.failed', { keyId: d.key_id, message: charge.errorMessage });
            failed++;
        }
    }

    logger.info('autorenew.run.complete', { processed: due.length, renewed, failed, skipped });
    return { processed: due.length, renewed, failed, skipped };
}
