#!/usr/bin/env bash
# End-to-end demo: set up the database, load all sources, start the API, and show
# that the breakdown sums to the summary and that re-ingesting changes nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
BASE="http://localhost:${PORT}"
FROM="${FROM:-2026-01-01}"
TO="${TO:-2026-09-01}"
TZ_ARG="${TZ_ARG:-Asia/Kolkata}"

pretty() { if command -v jq >/dev/null 2>&1; then jq .; elif command -v python3 >/dev/null 2>&1; then python3 -m json.tool; else cat; fi; }

echo "==> 1. migrate (tables, collected_revenue(), seed status_map)"
pnpm -s db:migrate

echo "==> 2. generate the legacy-ERP CSV"
pnpm -s make:csv

echo "==> 3. ingest (legacy CSV + any configured live sources)"
pnpm -s ingest

echo "==> 4. seed Stripe + Razorpay stand-in rows (no keys needed for the demo)"
pnpm -s db:seed

echo "==> 5. start the API"
SRV_LOG="$(mktemp)"
pnpm -s start >"$SRV_LOG" 2>&1 &   # log to a file so this script's stdout still closes cleanly
SRV=$!
cleanup() {
  pkill -P "$SRV" 2>/dev/null || true          # tsx child
  kill "$SRV" 2>/dev/null || true              # pnpm wrapper
  pkill -f "tsx.*src/server.ts" 2>/dev/null || true
}
trap cleanup EXIT
for _ in $(seq 1 30); do curl -sf "$BASE/health" >/dev/null 2>&1 && break || sleep 1; done
if ! curl -sf "$BASE/health" >/dev/null 2>&1; then echo "server failed to start:"; cat "$SRV_LOG"; exit 1; fi

echo
echo "==> SUMMARY  (from=$FROM to=$TO tz=$TZ_ARG)"
curl -s "$BASE/metrics/revenue/summary?from=$FROM&to=$TO&tz=$TZ_ARG" | pretty

echo
echo "==> BREAKDOWN (bucket=week) — summing each currency reproduces the summary exactly"
curl -s "$BASE/metrics/revenue/breakdown?from=$FROM&to=$TO&tz=$TZ_ARG&bucket=week" | pretty

echo
echo "==> IDEMPOTENCY: re-ingest; revenue does not change"
pnpm -s ingest
curl -s "$BASE/metrics/revenue/summary?from=$FROM&to=$TO&tz=$TZ_ARG" | pretty

echo
echo "Demo complete."
