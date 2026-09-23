import type { Db } from '../shared/db/client';
import type { ResolvedRange } from '../shared/time/range';
import { COLLECTED_STATUSES } from './metrics.definition';
import type { Bucket, Unclassified, UnclassifiedPair } from './metrics.types';

export type BucketGranularity = 'day' | 'week';

/**
 * The ONLY module that calls collected_revenue(). Enforced by the
 * single-implementation guard test. Everything that needs the number comes
 * through here.
 *
 * Returns one entry per (bucket, currency) with empty buckets zero-filled, so a
 * consumer's own sum of the series matches the summary. Gap-filling lives here
 * (the data layer), using generate_series under the SAME timezone as the
 * aggregation, so both views share the behaviour.
 */
export async function getBreakdown(
  db: Db,
  range: ResolvedRange,
  bucket: BucketGranularity,
): Promise<Bucket[]> {
  const collected = [...COLLECTED_STATUSES];
  const rows = await db<{ bucket_start: string; currency: string; amount_minor: string }[]>`
    with agg as (
      select bucket_start, currency, amount_minor
      from collected_revenue(
        ${range.from}, ${range.to}, ${range.tz}, ${bucket}, ${collected}::text[]
      )
    ),
    series as (
      select generate_series(
        date_trunc(${bucket}, ${range.from}::timestamptz at time zone ${range.tz}),
        -- The last-included bucket is the one containing (to minus epsilon).
        -- Subtract the microsecond from the ABSOLUTE instant BEFORE converting to
        -- local time, exactly as collected_revenue() buckets occurred_at; the two
        -- otherwise disagree across a DST transition at the end instant and a
        -- bucket is silently lost.
        date_trunc(${bucket}, (${range.to}::timestamptz - interval '1 microsecond') at time zone ${range.tz}),
        case when ${bucket} = 'day' then interval '1 day' else interval '1 week' end
      )::date as bucket_start
    ),
    currencies as (
      select distinct currency from agg
    )
    select s.bucket_start::text            as bucket_start,
           c.currency                       as currency,
           coalesce(a.amount_minor, 0)::text as amount_minor
    from series s
    cross join currencies c
    left join agg a
      on a.bucket_start = s.bucket_start and a.currency = c.currency
    order by s.bucket_start, c.currency
  `;
  return rows.map((r) => ({
    bucketStart: r.bucket_start,
    currency: r.currency.trim(),
    amountMinor: r.amount_minor,
  }));
}

/**
 * Transactions in the range whose (source, raw_status) has no status_map entry.
 * A LEFT JOIN with a null check, not a `not in` subquery (`not in` against a
 * nullable column silently returns nothing). Surfaced in every response so a
 * silent zero is impossible.
 */
export async function getUnclassified(db: Db, range: ResolvedRange): Promise<Unclassified> {
  const pairRows = await db<{ source: string; raw_status: string }[]>`
    select t.source, t.raw_status
    from transactions t
    left join status_map m
      on m.source = t.source and m.raw_status = t.raw_status
    where m.source is null
      and t.occurred_at >= ${range.from}
      and t.occurred_at <  ${range.to}
    group by t.source, t.raw_status
    order by t.source, t.raw_status
  `;
  const countRows = await db<{ count: number }[]>`
    select count(*)::int as count
    from transactions t
    left join status_map m
      on m.source = t.source and m.raw_status = t.raw_status
    where m.source is null
      and t.occurred_at >= ${range.from}
      and t.occurred_at <  ${range.to}
  `;
  const pairs: UnclassifiedPair[] = pairRows.map((r) => ({
    source: r.source,
    rawStatus: r.raw_status,
  }));
  return { count: countRows[0]?.count ?? 0, pairs };
}
