# Metrics That Never Drift

> Problem 2 — *"Can you build one metrics number that never drifts?"*

One canonical **collected revenue** number, computed across multiple payment sources with different status vocabularies, exposed through two views (a summary total and a day/week breakdown) that **agree by construction**, with **CI tripwires that fail the build** if a second implementation of the number ever appears.

**Stack:** Node 20+ · TypeScript (strict) · Express · [postgres.js](https://github.com/porsager/postgres) · Zod · Vitest · fast-check · Postgres (Neon).

**Code walkthrough** (flow by flow, for reviewers): [`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md). Design docs (open in a browser): [`docs/lld.html`](docs/lld.html) (low-level design) · [`docs/erd.html`](docs/erd.html) (data model) · [`docs/flow.html`](docs/flow.html) (flows). Interactive API docs: `/docs` (Swagger UI) on the running server. Plain-English overview deck: [`Problem-2-Explained.pptx`](Problem-2-Explained.pptx).

---

## Quickstart

```bash
pnpm install
cp .env.example .env          # then set DATABASE_URL to your POOLED Postgres string
pnpm db:migrate               # creates tables, collected_revenue(), seeds the vocabulary
pnpm demo                     # loads all sources, starts the API, prints both views
```

`pnpm demo` runs the whole thing end to end. To do it by hand:

```bash
pnpm make:csv                 # generate the legacy-ERP CSV source
pnpm ingest                   # normalize + upsert every configured source (fault-isolated)
pnpm db:seed                  # add Stripe/Razorpay stand-in rows (no API keys needed for the demo)
pnpm dev                      # start the API on $PORT (default 3000)

curl "localhost:3000/metrics/revenue/summary?from=2026-01-01&to=2026-09-01&tz=Asia/Kolkata"
curl "localhost:3000/metrics/revenue/breakdown?from=2026-01-01&to=2026-09-01&tz=Asia/Kolkata&bucket=week"
```

Setup needs only `DATABASE_URL`. Stripe/Razorpay keys are optional — without them those live sources are cleanly skipped and the CSV + seed data drive the demo.

**With real API keys** (Stripe/Razorpay test mode):
```bash
pnpm seed:stripe    # creates real charges in YOUR Stripe test account (fake cards, no money)
pnpm ingest         # the Stripe + Razorpay adapters pull real test-mode transactions
```

## Live deployment (Render, free tier)

The repo includes a [`render.yaml`](render.yaml) blueprint. In Render: **New → Blueprint → pick this repo**, then set the secret env vars (`DATABASE_URL`, `STRIPE_SECRET_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) in the dashboard. The service migrates on boot and serves the API; point it at the same Neon database and the data is already there.

**Interactive API docs (Swagger UI):** open `https://<your-app>.onrender.com/docs` (or `http://localhost:3000/docs`) and click **Try it out**. The raw spec is at `/openapi.json`.

Verify a running deployment:
```bash
curl https://<your-app>.onrender.com/health
curl "https://<your-app>.onrender.com/metrics/revenue/summary?from=2026-01-01&to=2026-12-31&tz=Asia/Kolkata"
curl -X POST https://<your-app>.onrender.com/ingest/run   # triggers a real ingestion job
```
Note: the free tier sleeps after ~15 min idle, so the first request may take ~50s to cold-start.

---

## The definition, in one sentence

> **Collected revenue** for a range is the sum of `amount_minor`, grouped by currency, over transactions whose `(source, raw_status)` maps to a canonical status in `COLLECTED_STATUSES` (an **allow-list** = `['collected']`), where `occurred_at` falls in the half-open interval `[from, to)` evaluated in the caller's timezone.

It lives in exactly one place: [`src/metrics/metrics.definition.ts`](src/metrics/metrics.definition.ts) declares the allow-list, and the SQL function [`collected_revenue()`](src/shared/db/migrations/002_collected_revenue.sql) receives it as a **parameter** — so no status literal is hardcoded in any SQL. Interpretation happens at **read time** by joining to `status_map`; ingestion stores `raw_status` verbatim and never interprets it.

### Edge cases, decided once

| Question | Ruling | Why |
| --- | --- | --- |
| Unknown / new status? | Contributes **zero**, and is reported in `unclassified` | Allow-list = fail closed, but **loud** |
| Refunds? | Not in the allow-list, so excluded by construction | Status is one field per row; gross-vs-net only arises with separate negative records (out of scope) |
| Multiple currencies? | Totals **per currency**, no conversion | Summing INR + USD is confidently wrong; FX needs dated rates |
| Timezone? | One IANA `tz` param (default `UTC`), applied identically in both views | Mixed bucketing is the #1 source of drift |
| Money? | Integer **minor units** in `bigint`, never float | `parseFloat('1250.50')*100 === 125049.999…` |
| End of range? | **Exclusive** — half-open `[from, to)` | A midnight-boundary event is never double-counted |

---

## The two views

Both call the same repository and the same SQL function. **The summary is a fold over the breakdown**, never a separate query — two views cannot disagree when one is literally the sum of the other.

**`GET /metrics/revenue/summary?from=&to=&tz=&currency=`**

```json
{
  "range": { "from": "2025-12-31T18:30:00.000Z", "to": "2026-08-31T18:30:00.000Z", "tz": "Asia/Kolkata" },
  "definition": "collected revenue = sum(amount_minor) grouped by currency, over transactions whose (source, raw_status) maps to a canonical status in {collected}, with occurred_at in [from, to) evaluated in the caller's timezone",
  "totals": [
    { "currency": "INR", "amountMinor": "49265124" },
    { "currency": "USD", "amountMinor": "296475" }
  ],
  "unclassified": { "count": 1, "pairs": [ { "source": "legacy_erp", "rawStatus": "DISPUTED" } ] }
}
```

**`GET /metrics/revenue/breakdown?from=&to=&tz=&bucket=day|week&currency=`** returns the same envelope with a `buckets` array (empty buckets zero-filled) in place of `totals`. Summing `buckets` by currency reproduces `totals` exactly.

- Amounts are **strings** of integer minor units (bigint-safe over JSON), never a float or a pre-formatted string.
- `unclassified` rides in every response, so a silent zero is impossible.
- Every response echoes the applied `from`/`to`/`tz`/`bucket`, so a screenshot is self-describing.
- **Ingestion:** `POST /ingest/run` (all sources, fault-isolated) and `POST /sources/:source/sync` (one source).

---

## How a second implementation gets caught

The brief's hardest clause asks for a **mechanism**, not a convention. Four tripwires run in CI and fail the build:

| Tripwire | Test | What it asserts |
| --- | --- | --- |
| **Reconciliation** | `tests/property/metrics.reconciliation.test.ts` | `fast-check` over 60 random ranges × 3 timezones × 2 buckets: the folded breakdown equals an **independent ground-truth total**, strict integer equality, no tolerance |
| **Mapping coverage** | `tests/guards/mapping-coverage.test.ts` | Every `(source, raw_status)` in `transactions` has a `status_map` row; an unmapped status is surfaced |
| **Single implementation** | `tests/guards/single-implementation.test.ts` | The `collected` literal appears in only `metrics.definition.ts`; `collected_revenue()` has exactly one caller; no `from transactions` SQL outside `src/metrics/`; the SQL function hardcodes no status literal |
| **Type exhaustiveness** | `pnpm typecheck` (CI) | Every `switch` over `CanonicalStatus` ends in `assertNever`; adding a status breaks compilation until handled |

### Demonstration: three deliberate breakages, three tripwires firing

Real output captured by breaking the code, running the guard, and reverting.

**1. Add a status to the data without mapping it → mapping coverage fires**

```text
× mapping coverage > every (source, raw_status) in fully-mapped data is mapped
  → expected 1 to be +0        // an unmapped (legacy_erp, PAID) row was detected
```

**2. Re-declare the allow-list elsewhere → single-implementation guard fires**

```text
× single-implementation guard > the canonical status literal "collected" appears in exactly one TS file
  → expected [ …(2) ] to deeply equal [ 'src/metrics/metrics.definition.ts' ]
  +   "src/metrics/metrics.service.ts"
```

**3. Widen the SQL definition to also count `pending` → reconciliation fires**

```text
× reconciliation > sum(breakdown) === independent ground truth ...
  → Property failed after 1 tests
  Counterexample: [0, 256, "UTC", "day"]
  Got: expected { INR: '25125050', USD: '134900' } to deeply equal { INR: '25125050', USD: '129900' }
                                        ^ the extra $50 is a leaked `pending` charge
```

---

## Architecture

One load-bearing rule: **exactly one component knows which statuses count, and every read path goes through it.**

```
src/
  sources/        write side — one folder per source (stripe, razorpay, legacy-erp)
                  each: *.schema (Zod) → *.mapper (verbatim status) → *.service (adapter)
  ingestion/      fault-isolated orchestration; idempotent upsert; per-record quarantine
                  ingestion.types.ts  → CanonicalTransaction (the shared write contract)
  metrics/        read side
    metrics.definition.ts   COLLECTED_STATUSES — the ONLY declaration
    metrics.repository.ts    the ONLY caller of collected_revenue(); gap-fill + unclassified
    metrics.service.ts       folds buckets into totals (summary = fold of breakdown)
    metrics.controller.ts / metrics.routes.ts / metrics.schema.ts
  shared/         config/env (fail-fast) · db/client + migrations · money/minor-units ·
                  time/range (half-open + IANA tz) · errors · http (correlation, error-handler)
tests/            unit · integration · property · guards
scripts/          make-legacy-csv · db-migrate · db-seed · ingest · db-ping · demo.sh
```

Adding a fourth source is a new folder plus rows in `status_map` — **no file under `metrics/` changes.** Full detail: [`docs/lld.html`](docs/lld.html).

---

## Testing

```bash
pnpm test            # unit + integration + property + guards
pnpm test:unit       # no database needed
pnpm typecheck       # strict; enforces the exhaustiveness tripwire
```

- **Isolation:** each DB test creates a uniquely-named `test_*` schema, migrates into it, and drops it after — so tests never touch real data and never collide. See [`tests/helpers/db.ts`](tests/helpers/db.ts).
- **Real data, not mocks:** integration/property/guard tests run against a real Postgres, so they prove timezone and interval handling, not just arithmetic.
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) spins up an ephemeral Postgres container, then runs `typecheck` + `test`. It never depends on a cloud database.
- Bump reconciliation coverage with `RECON_RUNS=200 pnpm test:property`.

---

## Database

The brief names Supabase; this build runs on **Neon** and is standard Postgres, so it is portable to a free Supabase project by swapping `DATABASE_URL` alone. Two things worth knowing:

- Use the **pooled** endpoint (Neon: the `-pooler` host; Supabase: the session pooler) for the app. The reconciliation test opens many short queries and would exhaust a direct connection.
- The **test harness** deliberately connects to the **direct** endpoint (it strips `-pooler`), because tests rely on session state (`search_path`) that a transaction pooler would not preserve.

---

## Deliberately out of scope

Authentication, pagination, caching, multi-tenancy, a UI, partial-refund modelling, and FX conversion. Each is a decision, not an oversight — naming them is a stronger signal than omitting them silently.

## What I'd do in production

- Append-only status events with **validity-dating** on the mapping, so correcting a past mapping doesn't rewrite history.
- **Alerting** on a rising `unclassified` count — the early signal that a source added a status.
- Dated **FX rates** (as-of) if a single converted total is ever required.
- An AST-based lint rule to replace the (intentionally crude, and honestly labelled) grep guard once the codebase justifies it.

## Key decisions

| Decision | Chosen | Rejected | Why |
| --- | --- | --- | --- |
| Where the allow-list lives | One TS constant, passed into SQL | A literal in the SQL function | A literal in both languages is itself a second implementation |
| When status is interpreted | Read time, via `status_map` | Write time, a `canonical_status` column | A new status is one row, not a backfill |
| How the summary is produced | Folded from the breakdown | A second aggregate query | The fold is verifiable at a glance and cannot drift |
| Money | `bigint` minor units | `numeric` / float | Exact; makes strict-equality tests trivially safe |
| Currency | Per-currency totals | A single converted total | Conversion needs dated FX to be defensible |

Full decision log with the reviewer Q&A: [`docs/lld.html#decisions`](docs/lld.html). Tradeoffs are captured in that table and in "Deliberately out of scope" above.

---

## Sources & references

- **Postgres.js** docs — parameterized queries, arrays, `.simple()` for multi-statement migrations: <https://github.com/porsager/postgres>
- **Postgres** `date_trunc`, `AT TIME ZONE`, `generate_series` for timezone-aware bucketing and gap-filling: <https://www.postgresql.org/docs/current/functions-datetime.html>
- Insert-vs-update detection via the `xmax = 0` system column trick (Stack Overflow / Postgres internals).
- **Stripe** API — Charges/PaymentIntents, test mode, test cards (`pm_card_visa`, `pm_card_chargeDeclined`): <https://docs.stripe.com/testing>
- **Razorpay** Payments API and test mode: <https://razorpay.com/docs/api/payments/>
- **Luxon** for IANA-timezone parsing and half-open range resolution: <https://moment.github.io/luxon/>
- **Zod** (validation), **Vitest** (tests), **fast-check** (property testing for reconciliation): <https://zod.dev> · <https://vitest.dev> · <https://fast-check.dev>
- **Neon** serverless Postgres (used in place of Supabase; standard Postgres, pooled endpoint): <https://neon.tech/docs>
- **Render** free-tier Node web service + Blueprints: <https://render.com/docs/blueprint-spec>
- Free-tier accounts/APIs used: **Neon** (database), **Stripe test mode** (Source A), **Razorpay test mode** (Source B), **Render** (hosting), **GitHub Actions** (CI).

## AI usage

I used **Claude (Anthropic)** as a pair-programmer while building this — to draft the plan, scaffold the modules, write tests, and run an adversarial self-review of my own code. I directed and reviewed the output rather than accepting it blindly; concretely:

- The plan and structure were mine; the AI filled in implementations against a spec I set.
- I ran a **multi-agent adversarial review** over the finished code, which surfaced real bugs I then fixed and added regression tests for — most notably a **DST gap-fill bug** that silently dropped a bucket's revenue at a daylight-saving fall-back, a **UTF-8 BOM** that would have quarantined an entire CSV, and a **currency-exponent** bug (JPY/KWD mis-scaled). See the commit history and the DST regression test in `tests/integration/metrics.timezone.test.ts`.
- Every AI suggestion was verified by running it: `pnpm typecheck`, the full test suite against a real database, and an end-to-end demo.

Full conversation export: **&lt;paste your Claude share link here&gt;**.
