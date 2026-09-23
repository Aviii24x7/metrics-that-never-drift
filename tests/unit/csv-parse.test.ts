import { describe, it, expect } from 'vitest';
import { parseCsv } from '../../src/shared/csv/parse';

const HEADER = 'invoice_no,state,total,ccy,invoice_date';

describe('CSV parser', () => {
  it('parses a plain file into header-keyed records', () => {
    const recs = parseCsv(`${HEADER}\nINV-1,PAID,10.00,USD,2026-01-01\n`);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ invoice_no: 'INV-1', state: 'PAID', ccy: 'USD' });
  });

  it('strips a leading UTF-8 BOM so the first column key is not corrupted', () => {
    const recs = parseCsv(`﻿${HEADER}\nINV-1,PAID,10.00,USD,2026-01-01\n`);
    expect(Object.keys(recs[0]!)).toContain('invoice_no'); // not "﻿invoice_no"
  });

  it('handles quoted fields with embedded commas', () => {
    const recs = parseCsv(`a,b\n"x,y",z\n`);
    expect(recs[0]).toEqual({ a: 'x,y', b: 'z' });
  });

  it('treats a stray quote mid-field as a literal, not a row-swallowing quote', () => {
    const recs = parseCsv(`a,b\n6" pipe,ok\nnext,row\n`);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toEqual({ a: '6" pipe', b: 'ok' });
    expect(recs[1]).toEqual({ a: 'next', b: 'row' });
  });

  it('handles CRLF line endings', () => {
    const recs = parseCsv(`a,b\r\n1,2\r\n`);
    expect(recs[0]).toEqual({ a: '1', b: '2' });
  });
});
