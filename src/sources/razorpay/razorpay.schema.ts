import { z } from 'zod';

/**
 * The subset of a Razorpay payment this service relies on. Amounts are integer
 * minor units (paise); `created_at` is Unix seconds. Statuses include
 * "captured", "authorized", "refunded", "failed" — a deliberately different
 * vocabulary from Stripe's.
 */
export const RazorpayPaymentSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int(),
  currency: z.string().min(1),
  status: z.string().min(1),
  created_at: z.number().int(),
});

export type RazorpayPayment = z.infer<typeof RazorpayPaymentSchema>;

/** The list envelope Razorpay returns from GET /v1/payments. */
export const RazorpayListSchema = z.object({
  count: z.number().int().optional(),
  items: z.array(z.unknown()),
});
