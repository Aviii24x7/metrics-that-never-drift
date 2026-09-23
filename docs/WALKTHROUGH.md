# Code Walkthrough

A flow-by-flow tour of the codebase. Read this once and you can trace any request end to end. For the visual version see [flow.html](flow.html); for the full design see [lld.html](lld.html) and [erd.html](erd.html).

## The one rule everything serves

> **Exactly one component decides which statuses count as collected, and every read path goes through it.**

Ingestion stores each source's status word *verbatim* and never interprets it. Meaning is assigned once, at **read time**, by joining to `status_map`. That single seam is why a new source or a new status can arrive without touching the metric.

### The 6-line mental model
1. Sources store the status word **verbatim** — no interpretation on write.
2. Meaning is assigned at **read time** by joining to `status_map` (data, not code).
3. **One SQL function** is the definition; the allow-list is passed *into* it, so it exists once.
4. **Allow-list via inner join** → an unknown status can't be revenue; `unclassified` reports it.
5. **Summary = fold of the breakdown** → the two views can't disagree.
6. **Four CI tripwires** catch any second implementation; adding a status breaks compilation.

## Codebase map

| Path | Responsibility |
| --- | --- |
| [src/sources/](../src/sources) | Write side — one folder per source. `*.schema` (Zod) → `*.mapper` (verbatim status) → `*.service` (adapter) |
| [src/ingestion/](../src/ingestion) | Fault-isolated orchestration; idempotent upsert; per-record quarantine. `ingestion.types.ts` declares `CanonicalTransaction` |
| [src/metrics/metrics.definition.ts](../src/metrics/metrics.definition.ts) | **The** allow-list — the only place a canonical status literal lives |
| [src/metrics/metrics.repository.ts](../src/metrics/metrics.repository.ts) | The only caller of `collected_revenue()`; gap-fill + unclassified |
| [src/metrics/metrics.service.ts](../src/metrics/metrics.service.ts) | Folds buckets into totals (summary = fold of breakdown) |
| [src/shared/db/migrations/](../src/shared/db/migrations) | `001` tables, `002` the SQL definition function, `003` seed vocabulary |
| [src/shared/time/range.ts](../src/shared/time/range.ts) | Half-open range + IANA timezone resolution |
| [src/shared/money/minor-units.ts](../src/shared/money/minor-units.ts) | Decimal string → `bigint`, no floats |
| [tests/](../tests) | unit · integration · property (reconciliation) · guards (anti-drift) |

---

## Flow 1 — Ingesting a payment (the write path)

**Entry:** `POST /ingest/run` (or `pnpm ingest`) → `runIngestion()` in [ingestion.service.ts](../src/ingestion/ingestion.service.ts).

**1a. Orchestrate each source, isolating failures.**
```ts
for (const adapter of adapters) {
  if (!adapter.isConfigured()) { /* mark "skipped", continue */ }
  try {
    const { valid, invalid } = await adapter.fetch();
    const counts = await repo.upsertTransactions(db, valid);
    for (const bad of [...invalid, ...counts.failed]) {
      try { await repo.quarantine(db, adapter.name, bad.payload, bad.error); }
      catch (qe) { logger.error('quarantine write failed', ...); } // best-effort
    }
  } catch (e) { /* one source failing does NOT stop the others */ }
}
```
*Why:* the brief grades failure handling. Each source is in its own `try`; each row is isolated inside `upsertTransactions`; a failed quarantine can't mask committed work.

**1b. The mapper normalizes shape but keeps status verbatim** ([legacy-erp.mapper.ts](../src/sources/legacy-erp/legacy-erp.mapper.ts)):
```ts
return {
  source: 'legacy_erp',
  externalId: row.invoice_no,
  rawStatus: row.state,                                      // "PAID" — VERBATIM
  amountMinor: decimalStringToMinor(row.total, currencyExponent(currency)), // "1250.50" -> 125050n
  currency,
  occurredAt: occurred.toJSDate(),
  raw: row,                                                  // full payload kept
};
```
*Why:* ingestion records *what the source said*, not *what it means*. That is the load-bearing decision of the whole design. `decimalStringToMinor` uses string math (never `parseFloat`), so money is exact; `currencyExponent` handles non-2-decimal currencies (JPY/KWD).

**1c. Idempotent, row-isolated upsert** ([ingestion.repository.ts](../src/ingestion/ingestion.repository.ts)):
```ts
insert into transactions (...)
values (..., ${r.amountMinor.toString()}::bigint, ...)
on conflict (source, external_id) do update set raw_status = excluded.raw_status, ...
returning (xmax = 0) as inserted     -- xmax=0 => INSERT, else UPDATE
```
*Why:* `on conflict (source, external_id) do update` makes re-running a sync safe — **running ingest twice never inflates revenue**. The `xmax = 0` trick reports insert-vs-update in one statement.

---

## Flow 2 — Computing the summary (the read path)

**Entry:** `GET /metrics/revenue/summary` → `summary()` in [metrics.controller.ts](../src/metrics/metrics.controller.ts).

**2a. Validate, then resolve the range** — Zod (`400` on bad params) then `resolveRange` ([range.ts](../src/shared/time/range.ts)):
```ts
const from = resolveInstant(fromRaw, tz);   // "2026-01-01" + "Asia/Kolkata" -> 2025-12-31T18:30:00Z
const to   = resolveInstant(toRaw, tz);
if (to.getTime() <= from.getTime()) throw new RangeParseError('`to` must be strictly after `from`...');
```
*Why:* both endpoints call this same function, so they can't interpret a range differently. `[from, to)` is half-open — a midnight-boundary event is never double-counted.

**2b. The summary is a FOLD over the breakdown** ([metrics.service.ts](../src/metrics/metrics.service.ts)):
```ts
export async function getSummary(db, range, currency?) {
  const { buckets, unclassified } = await getBreakdown(db, range, 'day', currency);
  return { totals: foldBucketsToTotals(buckets), unclassified };   // just sum the pieces
}
```
*Why:* this is the answer to *"make sure both views always agree."* The summary is literally the sum of the breakdown — two views can't disagree when one is arithmetic performed on the other. The fold uses `BigInt`, so it's exact.

---

## Flow 3 — The breakdown, and where the number is actually computed

**Entry:** `GET /metrics/revenue/breakdown` → `getBreakdown()` in [metrics.repository.ts](../src/metrics/metrics.repository.ts) — the **only** caller of the SQL function.

**3a. Call the one definition, then zero-fill gaps in SQL:**
```sql
with agg as (                                    -- THE definition, via one function
  select bucket_start, currency, amount_minor
  from collected_revenue(${from}, ${to}, ${tz}, ${bucket}, ${collected}::text[])
),
series as (                                      -- every bucket, even empty ones
  select generate_series(
    date_trunc(${bucket}, ${from}::timestamptz at time zone ${tz}),
    date_trunc(${bucket}, (${to}::timestamptz - interval '1 microsecond') at time zone ${tz}),
    case when ${bucket} = 'day' then interval '1 day' else interval '1 week' end
  )::date as bucket_start
), currencies as (select distinct currency from agg)
select s.bucket_start, c.currency, coalesce(a.amount_minor, 0)::text as amount_minor
from series s cross join currencies c
left join agg a on a.bucket_start = s.bucket_start and a.currency = c.currency
```
*Why:* empty buckets are filled with **zero in SQL** under the *same* timezone as the aggregation, so the series has no gaps and a consumer summing it gets exactly the summary. The `- interval '1 microsecond'` is subtracted from the **absolute instant before** the timezone conversion, matching how the function buckets `occurred_at` — otherwise a bucket is silently dropped at a daylight-saving transition (there is a regression test for this in [metrics.timezone.test.ts](../tests/integration/metrics.timezone.test.ts)).

**3b. The function itself — the allow-list as an inner join** ([002_collected_revenue.sql](../src/shared/db/migrations/002_collected_revenue.sql)):
```sql
from transactions t
join status_map m on m.source = t.source and m.raw_status = t.raw_status  -- INNER join
where m.canonical = any(p_collected)         -- p_collected = ['collected'], passed IN
  and t.occurred_at >= p_from and t.occurred_at < p_to                    -- half-open
group by 1, 2;
```
*Why, three points:* (1) the **inner join** means a status with no mapping can't match, so it can't be counted — the allow-list is enforced by the query's shape; (2) `p_collected` is a **parameter**, so the definition lives in exactly one place (TypeScript), never hardcoded in SQL; (3) `>= p_from and < p_to` is the half-open range.

---

## Flow 4 — An unknown / brand-new status arrives (fail closed, but loud)

It lands in `transactions` (no FK blocks it), the inner join in Flow 3 skips it (**not revenue**), and it is reported by `getUnclassified()`:
```sql
from transactions t
left join status_map m on m.source = t.source and m.raw_status = t.raw_status
where m.source is null   -- LEFT join + null check, not `not in`
```
Every response carries `"unclassified": { count, pairs }`.

*Why:* this is the **allow-list vs exclusion-list** point. An exclusion list (`not in (...)`) would silently let a new status through as revenue. The allow-list ignores what it doesn't recognize, and `unclassified` makes that visible — fail closed, report loudly. (`left join ... is null`, not `not in`, because `not in` against a nullable column silently returns nothing.)

---

## Flow 5 — Adding a new source system

Add one folder under `src/sources/newsource/` (schema + mapper + service) and rows in `status_map`. **Nothing under `src/metrics/` changes.**

*Why:* meaning lives in data (`status_map`) and the definition is one parameterized function, so a fourth source is a data change, not a metric change. Demoable live: `insert into status_map values ('newsource','SETTLED','collected')` and the number updates with no deploy.

---

## Flow 6 — Someone adds a second implementation → it gets caught

Four CI tripwires (all in [tests/](../tests)), each fails the build:

- **Reconciliation** ([metrics.reconciliation.test.ts](../tests/property/metrics.reconciliation.test.ts)) — `fast-check` over random ranges × timezones × buckets asserts the folded breakdown equals an **independent ground-truth total**, strict integer equality.
- **Single implementation** ([single-implementation.test.ts](../tests/guards/single-implementation.test.ts)) — the `collected` literal is in one file; `collected_revenue()` has one caller; the `transactions` table is read (FROM/JOIN, schema-qualified too) in one module; the SQL function has no status literal; the `CHECK` constraint matches `CANONICAL_STATUSES`.
- **Mapping coverage** ([mapping-coverage.test.ts](../tests/guards/mapping-coverage.test.ts)) — an unmapped `(source, raw_status)` is detected.
- **Type exhaustiveness** — [`COLLECTED_BY_STATUS`](../src/metrics/metrics.definition.ts) is a `Record<CanonicalStatus, boolean>`, so adding a sixth status **fails `tsc`** until you decide whether it counts as revenue.

*Why:* the brief says *"something would actually catch it"* — the word is **catch**, and catching happens in CI, not a code comment. The README's breakage table shows all three firing on real bugs.

---

## Flow 7 — Failure handling

[error-handler.ts](../src/shared/http/error-handler.ts): `ZodError`/`ValidationError` → `400` naming the field; `DatabaseError` → `503`; anything else → `500`, logged with a **correlation id** ([correlation.ts](../src/shared/http/correlation.ts)) that is also echoed on the response. No stack trace ever reaches the client.

---

## Appendix — invariants that keep the number honest

| Concern | Rule | Where |
| --- | --- | --- |
| Money | integer minor units in `bigint`, string over the wire | [minor-units.ts](../src/shared/money/minor-units.ts) |
| Decimal parsing | string/BigInt only; `>exponent` digits rejected | `decimalStringToMinor` |
| Range | half-open `[from, to)` | [range.ts](../src/shared/time/range.ts), `002` SQL |
| Timezone | one IANA param, applied identically in both views | `resolveRange`, `collected_revenue()` |
| Gap-fill | `generate_series` in SQL, same tz as aggregation | [metrics.repository.ts](../src/metrics/metrics.repository.ts) |
| Currency | totals per currency, never summed across | `foldBucketsToTotals`, `group by ... currency` |
