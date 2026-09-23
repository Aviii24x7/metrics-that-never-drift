-- 001_core.sql — tables and indexes.
-- Idempotent: safe to run repeatedly (`if not exists`).

create table if not exists transactions (
  id            bigserial   primary key,
  source        text        not null,
  external_id   text        not null,
  raw_status    text        not null,   -- verbatim from the source; never interpreted here
  amount_minor  bigint      not null,   -- integer minor units (paise/cents)
  currency      char(3)     not null,   -- ISO-4217
  occurred_at   timestamptz not null,   -- when the money event happened
  raw           jsonb       not null,   -- full original payload, so a mapping can be corrected without re-fetching
  ingested_at   timestamptz not null default now(),
  unique (source, external_id)          -- makes re-running a sync idempotent
);

-- The vocabulary table: (source, raw_status) -> canonical meaning.
-- Deliberately NOT referenced by a foreign key from transactions: an unmapped
-- status must still be insertable so it can be reported as `unclassified`.
create table if not exists status_map (
  source     text not null,
  raw_status text not null,
  canonical  text not null
    check (canonical in ('collected', 'pending', 'failed', 'refunded', 'voided')),
  primary key (source, raw_status)
);

-- Per-record failure isolation during ingestion.
create table if not exists ingest_quarantine (
  id          bigserial   primary key,
  source      text        not null,
  payload     jsonb       not null,
  error       text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_transactions_occurred_at   on transactions (occurred_at);
create index if not exists idx_transactions_source_status on transactions (source, raw_status);
