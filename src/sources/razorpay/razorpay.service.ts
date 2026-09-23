import { env } from '../../shared/config/env';
import type { FetchResult, SourceAdapter } from '../../ingestion/ingestion.types';
import { RazorpayListSchema, RazorpayPaymentSchema } from './razorpay.schema';
import { mapRazorpayPayment } from './razorpay.mapper';

const PAGE = 100;
const MAX_PAYMENTS = 200;

/**
 * Pulls payments from Razorpay test mode via the REST API (Basic auth). Only
 * runs when both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set.
 */
export const razorpayAdapter: SourceAdapter = {
  name: 'razorpay',
  isConfigured() {
    return env.RAZORPAY_KEY_ID.length > 0 && env.RAZORPAY_KEY_SECRET.length > 0;
  },
  async fetch(): Promise<FetchResult> {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const valid: FetchResult['valid'] = [];
    const invalid: FetchResult['invalid'] = [];

    for (let skip = 0; skip < MAX_PAYMENTS; skip += PAGE) {
      const res = await fetch(`https://api.razorpay.com/v1/payments?count=${PAGE}&skip=${skip}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) {
        throw new Error(`Razorpay API returned ${res.status} ${res.statusText}`);
      }
      const list = RazorpayListSchema.parse(await res.json());
      for (const item of list.items) {
        const parsed = RazorpayPaymentSchema.safeParse(item);
        if (!parsed.success) {
          invalid.push({ payload: item, error: parsed.error.message });
        } else {
          valid.push(mapRazorpayPayment(parsed.data));
        }
      }
      if (list.items.length < PAGE) break; // last page
    }

    return { valid, invalid };
  },
};
