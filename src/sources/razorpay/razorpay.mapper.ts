import { integerToMinor } from '../../shared/money/minor-units';
import type { CanonicalTransaction } from '../../ingestion/ingestion.types';
import type { RazorpayPayment } from './razorpay.schema';

/**
 * Map a Razorpay payment to the canonical shape. Status ("captured",
 * "authorized", "refunded", "failed") is copied verbatim.
 */
export function mapRazorpayPayment(payment: RazorpayPayment): CanonicalTransaction {
  return {
    source: 'razorpay',
    externalId: payment.id,
    rawStatus: payment.status, // verbatim
    amountMinor: integerToMinor(payment.amount),
    currency: payment.currency.toUpperCase(),
    occurredAt: new Date(payment.created_at * 1000),
    raw: payment,
  };
}
