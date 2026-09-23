-- 002_collected_revenue.sql — THE definition of "collected revenue".
--
-- This function is the single place the metric is computed. Both API views call
-- it (via metrics.repository.ts). Two things are deliberate:
--
--   1. The join to status_map is an INNER JOIN, so a status with no mapping
--      cannot match and therefore cannot be counted. The allow-list is expressed
--      structurally, not as an editable `IN (...)` list.
--   2. The set of "collected" canonical statuses is a PARAMETER (p_collected),
--      never a literal. It is declared once, in TypeScript
--      (metrics.definition.ts), and passed in. No canonical status literal
--      appears in this SQL.

create or replace function collected_revenue(
  p_from      timestamptz,
  p_to        timestamptz,
  p_tz        text,
  p_bucket    text,        -- 'day' or 'week' (validated before the call)
  p_collected text[]       -- COLLECTED_STATUSES, passed in from metrics.definition.ts
) returns table (bucket_start date, currency char(3), amount_minor bigint)
language sql
stable
as $$
  select (date_trunc(p_bucket, t.occurred_at at time zone p_tz))::date as bucket_start,
         t.currency,
         sum(t.amount_minor)::bigint as amount_minor
  from transactions t
  join status_map m
    on m.source = t.source and m.raw_status = t.raw_status
  where m.canonical = any(p_collected)
    and t.occurred_at >= p_from      -- half-open [from, to):
    and t.occurred_at <  p_to        -- start inclusive, end exclusive
  group by 1, 2;
$$;
