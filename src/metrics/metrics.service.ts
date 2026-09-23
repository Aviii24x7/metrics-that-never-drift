import type { Db } from '../shared/db/client';
import type { ResolvedRange } from '../shared/time/range';
import * as repo from './metrics.repository';
import type { BucketGranularity } from './metrics.repository';
import type { Bucket, CurrencyTotal, Unclassified } from './metrics.types';

export interface BreakdownResult {
  buckets: Bucket[];
  unclassified: Unclassified;
}

export interface SummaryResult {
  totals: CurrencyTotal[];
  unclassified: Unclassified;
}

/** The day/week breakdown, plus the unclassified report. */
export async function getBreakdown(
  db: Db,
  range: ResolvedRange,
  bucket: BucketGranularity,
  currency?: string,
): Promise<BreakdownResult> {
  const [allBuckets, unclassified] = await Promise.all([
    repo.getBreakdown(db, range, bucket),
    repo.getUnclassified(db, range),
  ]);
  const buckets = currency ? allBuckets.filter((b) => b.currency === currency) : allBuckets;
  return { buckets, unclassified };
}

/**
 * The summary total. This is a FOLD over the breakdown — never a separate
 * aggregate query. Two views cannot disagree when one is literally the sum of
 * the other. (Do not "optimise" this into its own SUM query; the reconciliation
 * property test and the single-implementation guard exist to stop that.)
 */
export async function getSummary(
  db: Db,
  range: ResolvedRange,
  currency?: string,
): Promise<SummaryResult> {
  const { buckets, unclassified } = await getBreakdown(db, range, 'day', currency);
  return { totals: foldBucketsToTotals(buckets), unclassified };
}

/** Sum a breakdown's buckets into one total per currency, in exact BigInt math. */
export function foldBucketsToTotals(buckets: Bucket[]): CurrencyTotal[] {
  const byCurrency = new Map<string, bigint>();
  for (const b of buckets) {
    byCurrency.set(b.currency, (byCurrency.get(b.currency) ?? 0n) + BigInt(b.amountMinor));
  }
  return [...byCurrency.entries()]
    .map(([currency, amount]) => ({ currency, amountMinor: amount.toString() }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
