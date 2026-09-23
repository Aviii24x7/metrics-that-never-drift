/**
 * Amounts are strings of integer minor units (bigint-safe over JSON). A JS
 * number would silently lose precision on large paise totals, so the wire
 * format is a string with an explicit currency beside it — never a float, never
 * a pre-formatted display string.
 */

export interface Bucket {
  /** Local date of the bucket start in the requested timezone, 'YYYY-MM-DD'. */
  bucketStart: string;
  currency: string;
  amountMinor: string;
}

export interface CurrencyTotal {
  currency: string;
  amountMinor: string;
}

export interface UnclassifiedPair {
  source: string;
  rawStatus: string;
}

export interface Unclassified {
  /** Number of transactions in the range with no status_map entry. */
  count: number;
  /** The distinct (source, raw_status) pairs that were unmapped. */
  pairs: UnclassifiedPair[];
}
