/**
 * The events a partner can subscribe to.
 *
 * Kept in its own module so services can emit without importing the delivery
 * machinery — `emitPartnerEvent` in webhooks.service.ts is the only consumer.
 */
export const PARTNER_EVENTS = ['qc_result.created', 'license.activated', 'machine.enrolled'] as const;

export type PartnerEvent = (typeof PARTNER_EVENTS)[number];

export const PARTNER_EVENT_DESCRIPTIONS: Record<PartnerEvent, string> = {
    'qc_result.created': 'A QC report was submitted by one of your technicians',
    'license.activated': 'One of your license keys was activated on a new device',
    'machine.enrolled': 'A machine was enrolled into your fleet',
};

export function isPartnerEvent(value: string): value is PartnerEvent {
    return (PARTNER_EVENTS as readonly string[]).includes(value);
}
