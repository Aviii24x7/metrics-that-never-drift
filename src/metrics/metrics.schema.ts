import { z } from 'zod';
import { env } from '../shared/config/env';
import { isValidTimeZone } from '../shared/time/range';

/**
 * One schema, shared by both routes, so the two views interpret a request
 * identically. `to` is exclusive; `tz` defaults to DEFAULT_TZ and is validated
 * against the IANA database. The range-ordering check (to > from) happens in
 * resolveRange, which both controllers call.
 */
export const SummaryQuery = z.object({
  from: z.string().min(1, 'from is required'),
  to: z.string().min(1, 'to is required'),
  tz: z.string().default(env.DEFAULT_TZ).refine(isValidTimeZone, 'unknown timezone'),
  currency: z.string().length(3).toUpperCase().optional(),
});

export const BreakdownQuery = SummaryQuery.extend({
  bucket: z.enum(['day', 'week']).default('day'),
});

export type SummaryQueryInput = z.infer<typeof SummaryQuery>;
export type BreakdownQueryInput = z.infer<typeof BreakdownQuery>;
