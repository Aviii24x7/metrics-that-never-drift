import { z } from 'zod';

/**
 * The subset of a Stripe charge this service relies on. Stripe amounts are
 * already integer minor units; `created` is Unix seconds. `metadata.occurred_at`
 * is honoured if present so demo data can carry a real event date (Stripe test
 * charges are always stamped "now" and cannot be backdated).
 */
export const StripeChargeSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int(),
  currency: z.string().min(1),
  status: z.string().min(1),
  created: z.number().int(),
  metadata: z.record(z.string()).optional().default({}),
});

export type StripeCharge = z.infer<typeof StripeChargeSchema>;
