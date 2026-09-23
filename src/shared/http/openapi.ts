/**
 * Hand-written OpenAPI 3.0 spec for the API. Served as JSON at /openapi.json and
 * rendered as interactive docs at /docs (Swagger UI). Kept small and explicit —
 * the whole API is five endpoints.
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Metrics That Never Drift — API',
    version: '1.0.0',
    description:
      'One canonical "collected revenue" number across Stripe, Razorpay and a legacy CSV, ' +
      'exposed through a summary and a breakdown that agree by construction. ' +
      'Money is integer minor units (string, bigint-safe); ranges are half-open [from, to); ' +
      'timezone is an explicit IANA parameter.',
  },
  servers: [{ url: '/', description: 'this server' }],
  tags: [
    { name: 'metrics', description: 'Read the collected-revenue number' },
    { name: 'ingestion', description: 'Pull and normalize source data' },
    { name: 'system', description: 'Health' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['system'],
        summary: 'Liveness check',
        responses: {
          '200': {
            description: 'OK',
            content: { 'application/json': { example: { ok: true } } },
          },
        },
      },
    },
    '/metrics/revenue/summary': {
      get: {
        tags: ['metrics'],
        summary: 'Total collected revenue per currency for a date range',
        description: 'The summary is a fold over the breakdown, so the two views cannot disagree.',
        parameters: [
          { $ref: '#/components/parameters/from' },
          { $ref: '#/components/parameters/to' },
          { $ref: '#/components/parameters/tz' },
          { $ref: '#/components/parameters/currency' },
        ],
        responses: {
          '200': {
            description: 'Per-currency totals plus the unclassified report',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SummaryResponse' },
                example: {
                  range: { from: '2025-12-31T18:30:00.000Z', to: '2026-12-31T18:30:00.000Z', tz: 'Asia/Kolkata' },
                  definition: 'collected revenue = sum(amount_minor) grouped by currency, over transactions whose (source, raw_status) maps to a canonical status in {collected}, with occurred_at in [from, to) evaluated in the caller\'s timezone',
                  totals: [
                    { currency: 'INR', amountMinor: '49265124' },
                    { currency: 'USD', amountMinor: '296475' },
                  ],
                  unclassified: { count: 1, pairs: [{ source: 'legacy_erp', rawStatus: 'DISPUTED' }] },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '503': { $ref: '#/components/responses/DatabaseError' },
        },
      },
    },
    '/metrics/revenue/breakdown': {
      get: {
        tags: ['metrics'],
        summary: 'Collected revenue per day or week, per currency',
        description: 'Empty buckets are zero-filled. Summing buckets by currency reproduces the summary exactly.',
        parameters: [
          { $ref: '#/components/parameters/from' },
          { $ref: '#/components/parameters/to' },
          { $ref: '#/components/parameters/tz' },
          {
            name: 'bucket',
            in: 'query',
            schema: { type: 'string', enum: ['day', 'week'], default: 'day' },
            description: 'Bucket granularity',
          },
          { $ref: '#/components/parameters/currency' },
        ],
        responses: {
          '200': {
            description: 'One entry per (bucket, currency), plus the unclassified report',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BreakdownResponse' },
                example: {
                  range: { from: '2025-12-31T18:30:00.000Z', to: '2026-12-31T18:30:00.000Z', tz: 'Asia/Kolkata', bucket: 'week' },
                  definition: 'collected = status_map.canonical in {collected}',
                  buckets: [
                    { bucketStart: '2026-01-05', currency: 'INR', amountMinor: '25125050' },
                    { bucketStart: '2026-01-05', currency: 'USD', amountMinor: '0' },
                  ],
                  unclassified: { count: 1, pairs: [{ source: 'legacy_erp', rawStatus: 'DISPUTED' }] },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '503': { $ref: '#/components/responses/DatabaseError' },
        },
      },
    },
    '/ingest/run': {
      post: {
        tags: ['ingestion'],
        summary: 'Run every configured source (fault-isolated)',
        description: 'Pulls Stripe + Razorpay (if keys are set) and the legacy CSV, normalizes, and upserts idempotently. One source failing does not stop the others.',
        responses: {
          '200': {
            description: 'Per-source outcome',
            content: {
              'application/json': {
                example: {
                  ranAt: '2026-09-23T06:27:55.000Z',
                  totals: { written: 6, updated: 36, quarantined: 0, failed: 0 },
                  sources: [
                    { source: 'legacy_erp', status: 'ok', written: 0, updated: 12, quarantined: 0, durationMs: 2100 },
                    { source: 'stripe', status: 'ok', written: 6, updated: 0, quarantined: 0, durationMs: 900 },
                    { source: 'razorpay', status: 'ok', written: 0, updated: 24, quarantined: 0, durationMs: 1200 },
                  ],
                },
              },
            },
          },
          '503': { $ref: '#/components/responses/DatabaseError' },
        },
      },
    },
    '/sources/{source}/sync': {
      post: {
        tags: ['ingestion'],
        summary: 'Run a single source',
        parameters: [
          {
            name: 'source',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: ['stripe', 'razorpay', 'legacy_erp'] },
          },
        ],
        responses: {
          '200': { description: 'Outcome for that source' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '503': { $ref: '#/components/responses/DatabaseError' },
        },
      },
    },
  },
  components: {
    parameters: {
      from: { name: 'from', in: 'query', required: true, schema: { type: 'string', example: '2026-01-01' }, description: 'Range start (inclusive). ISO date or datetime; a bare date is local midnight in tz.' },
      to: { name: 'to', in: 'query', required: true, schema: { type: 'string', example: '2026-12-31' }, description: 'Range end (EXCLUSIVE).' },
      tz: { name: 'tz', in: 'query', schema: { type: 'string', default: 'UTC', example: 'Asia/Kolkata' }, description: 'IANA timezone; applied identically to both views.' },
      currency: { name: 'currency', in: 'query', schema: { type: 'string', example: 'INR' }, description: 'Optional 3-letter filter.' },
    },
    schemas: {
      CurrencyTotal: {
        type: 'object',
        properties: { currency: { type: 'string' }, amountMinor: { type: 'string', description: 'integer minor units as a string' } },
      },
      Bucket: {
        type: 'object',
        properties: { bucketStart: { type: 'string', example: '2026-01-05' }, currency: { type: 'string' }, amountMinor: { type: 'string' } },
      },
      Unclassified: {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          pairs: { type: 'array', items: { type: 'object', properties: { source: { type: 'string' }, rawStatus: { type: 'string' } } } },
        },
      },
      SummaryResponse: {
        type: 'object',
        properties: {
          range: { type: 'object' },
          definition: { type: 'string' },
          totals: { type: 'array', items: { $ref: '#/components/schemas/CurrencyTotal' } },
          unclassified: { $ref: '#/components/schemas/Unclassified' },
        },
      },
      BreakdownResponse: {
        type: 'object',
        properties: {
          range: { type: 'object' },
          definition: { type: 'string' },
          buckets: { type: 'array', items: { $ref: '#/components/schemas/Bucket' } },
          unclassified: { $ref: '#/components/schemas/Unclassified' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
          correlationId: { type: 'string' },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Invalid parameters (e.g. to <= from, unknown timezone)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code: 'validation_error', message: '`to` must be strictly after `from`' }, correlationId: '…' } } },
      },
      DatabaseError: {
        description: 'The database was unreachable or a query failed',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
} as const;
