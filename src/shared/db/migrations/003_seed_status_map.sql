-- 003_seed_status_map.sql — the vocabulary mapping, as DATA.
--
-- Three sources, three vocabularies, one canonical column. Adding a fourth
-- source is more rows here, not a code change. Re-runnable via upsert.
--
-- (Provider status words and canonical values legitimately live in this seed
-- file; the anti-drift guard scans TypeScript, where the allow-list must appear
-- only in metrics.definition.ts.)

insert into status_map (source, raw_status, canonical) values
  ('stripe',     'succeeded',   'collected'),
  ('stripe',     'pending',     'pending'),
  ('stripe',     'failed',      'failed'),
  ('stripe',     'canceled',    'voided'),
  ('razorpay',   'captured',    'collected'),
  ('razorpay',   'authorized',  'pending'),
  ('razorpay',   'failed',      'failed'),
  ('razorpay',   'refunded',    'refunded'),
  ('legacy_erp', 'PAID',        'collected'),
  ('legacy_erp', 'DRAFT',       'pending'),
  ('legacy_erp', 'VOID',        'voided'),
  ('legacy_erp', 'WRITTEN_OFF', 'failed')
on conflict (source, raw_status) do update set canonical = excluded.canonical;
