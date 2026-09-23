import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../src/shared/config/env';

/**
 * Generate the synthetic legacy-ERP CSV — a source with no API, an UPPERCASE
 * vocabulary, decimal amounts, and dates deliberately spread across months and
 * across the Asia/Kolkata midnight boundary (so timezone handling is exercised).
 * One row uses an UNMAPPED status ("DISPUTED") to demonstrate `unclassified`.
 */
interface Row {
  invoice_no: string;
  state: string;
  total: string;
  ccy: string;
  invoice_date: string;
}

const rows: Row[] = [
  { invoice_no: 'INV-1001', state: 'PAID', total: '1250.50', ccy: 'INR', invoice_date: '2026-01-05T09:30:00Z' },
  { invoice_no: 'INV-1002', state: 'PAID', total: '990.00', ccy: 'USD', invoice_date: '2026-01-22T14:00:00Z' },
  { invoice_no: 'INV-1003', state: 'DRAFT', total: '500.00', ccy: 'INR', invoice_date: '2026-02-03T11:15:00Z' },
  { invoice_no: 'INV-1004', state: 'PAID', total: '4300.75', ccy: 'INR', invoice_date: '2026-02-18T08:45:00Z' },
  { invoice_no: 'INV-1005', state: 'VOID', total: '1200.00', ccy: 'USD', invoice_date: '2026-02-25T19:00:00Z' },
  { invoice_no: 'INV-1006', state: 'PAID', total: '75.25', ccy: 'USD', invoice_date: '2026-03-11T16:20:00Z' },
  // Boundary row: 18:30Z == 2026-04-01 00:00 in Asia/Kolkata (April in IST, March in UTC).
  { invoice_no: 'INV-1007', state: 'PAID', total: '9999.99', ccy: 'INR', invoice_date: '2026-03-31T18:30:00Z' },
  { invoice_no: 'INV-1008', state: 'WRITTEN_OFF', total: '820.00', ccy: 'INR', invoice_date: '2026-04-09T10:00:00Z' },
  { invoice_no: 'INV-1009', state: 'PAID', total: '150.00', ccy: 'USD', invoice_date: '2026-05-14T13:30:00Z' },
  { invoice_no: 'INV-1010', state: 'PAID', total: '2600.00', ccy: 'INR', invoice_date: '2026-06-02T07:05:00Z' },
  { invoice_no: 'INV-1011', state: 'DRAFT', total: '340.00', ccy: 'USD', invoice_date: '2026-07-19T18:00:00Z' },
  // Unmapped status — lands safely and shows up as `unclassified`, never as revenue.
  { invoice_no: 'INV-1012', state: 'DISPUTED', total: '999.00', ccy: 'INR', invoice_date: '2026-08-08T09:00:00Z' },
];

const header = 'invoice_no,state,total,ccy,invoice_date';
const body = rows.map((r) => [r.invoice_no, r.state, r.total, r.ccy, r.invoice_date].join(','));
const csv = [header, ...body].join('\n') + '\n';

await mkdir(path.dirname(env.LEGACY_CSV_PATH), { recursive: true });
await writeFile(env.LEGACY_CSV_PATH, csv, 'utf8');
console.log(`wrote ${rows.length} rows to ${env.LEGACY_CSV_PATH}`);
