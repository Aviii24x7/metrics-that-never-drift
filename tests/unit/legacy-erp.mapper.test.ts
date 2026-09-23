import { describe, it, expect } from 'vitest';
import { LegacyRowSchema } from '../../src/sources/legacy-erp/legacy-erp.schema';
import { mapLegacyRow } from '../../src/sources/legacy-erp/legacy-erp.mapper';

describe('legacy-erp mapper', () => {
  it('normalizes a row, converts the decimal exactly, keeps status verbatim', () => {
    const parsed = LegacyRowSchema.parse({
      invoice_no: 'INV-1',
      state: 'PAID',
      total: '1250.50',
      ccy: 'inr',
      invoice_date: '2026-01-05T09:30:00Z',
    });
    const c = mapLegacyRow(parsed);
    expect(c.source).toBe('legacy_erp');
    expect(c.externalId).toBe('INV-1');
    expect(c.rawStatus).toBe('PAID'); // verbatim uppercase, not interpreted
    expect(c.amountMinor).toBe(125050n);
    expect(c.currency).toBe('INR');
    expect(c.occurredAt.toISOString()).toBe('2026-01-05T09:30:00.000Z');
  });

  it('rejects a non-numeric total via the schema', () => {
    expect(
      LegacyRowSchema.safeParse({
        invoice_no: 'INV-2',
        state: 'PAID',
        total: 'oops',
        ccy: 'INR',
        invoice_date: '2026-01-05',
      }).success,
    ).toBe(false);
  });
});
