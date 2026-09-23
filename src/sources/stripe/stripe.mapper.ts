import { DateTime } from 'luxon';
import { integerToMinor } from '../../shared/money/minor-units';
import type { CanonicalTransaction } from '../../ingestion/ingestion.types';
import type { StripeCharge } from './stripe.schema';

/**
 * Map a Stripe charge to the canonical shape. The status ("succeeded",
 * "pending", "failed") is copied verbatim; the mapper does not decide what it
 * means. Prefers `metadata.occurred_at` for the event time, falling back to
 * `created`.
 */
export function mapStripeCharge(charge: StripeCharge): CanonicalTransaction {
  return {
    source: 'stripe',
    externalId: charge.id,
    rawStatus: charge.status, // verbatim
    amountMinor: integerToMinor(charge.amount),
    currency: charge.currency.toUpperCase(),
    occurredAt: resolveOccurredAt(charge),
    raw: charge,
  };
}

function resolveOccurredAt(charge: StripeCharge): Date {
  const meta = charge.metadata?.['occurred_at'];
  if (meta) {
    const dt = DateTime.fromISO(meta, { zone: 'utc' });
    if (dt.isValid) return dt.toJSDate();
  }
  return new Date(charge.created * 1000);
}
