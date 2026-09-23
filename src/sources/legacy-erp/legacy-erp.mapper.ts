import { DateTime } from 'luxon';
import { currencyExponent, decimalStringToMinor } from '../../shared/money/minor-units';
import type { CanonicalTransaction } from '../../ingestion/ingestion.types';
import type { LegacyRow } from './legacy-erp.schema';

/**
 * Map a legacy-ERP row to the canonical shape. Field names and the decimal
 * amount are converted; the status word (PAID, VOID, DRAFT, WRITTEN_OFF…) is
 * copied verbatim into rawStatus and never interpreted here.
 */
export function mapLegacyRow(row: LegacyRow): CanonicalTransaction {
  const occurred = DateTime.fromISO(row.invoice_date, { zone: 'utc' });
  if (!occurred.isValid) {
    throw new Error(`invalid invoice_date "${row.invoice_date}": ${occurred.invalidReason}`);
  }
  const currency = row.ccy.toUpperCase();
  return {
    source: 'legacy_erp',
    externalId: row.invoice_no,
    rawStatus: row.state, // verbatim
    amountMinor: decimalStringToMinor(row.total, currencyExponent(currency)),
    currency,
    occurredAt: occurred.toJSDate(),
    raw: row,
  };
}
