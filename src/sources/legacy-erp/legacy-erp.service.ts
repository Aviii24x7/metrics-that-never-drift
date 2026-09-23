import { readFile } from 'node:fs/promises';
import { env } from '../../shared/config/env';
import { parseCsv } from '../../shared/csv/parse';
import type { FetchResult, SourceAdapter } from '../../ingestion/ingestion.types';
import { LegacyRowSchema } from './legacy-erp.schema';
import { mapLegacyRow } from './legacy-erp.mapper';

/**
 * A file-based source: proves that a system with no API normalizes identically
 * to the live ones. It has no network, keys or rate limits, so the whole metric
 * path can be built and tested against it first.
 */
export const legacyErpAdapter: SourceAdapter = {
  name: 'legacy_erp',
  isConfigured() {
    return true; // file-based; always available (a missing file surfaces as a fetch failure)
  },
  async fetch(): Promise<FetchResult> {
    const csv = await readFile(env.LEGACY_CSV_PATH, 'utf8');
    const records = parseCsv(csv);
    const valid: FetchResult['valid'] = [];
    const invalid: FetchResult['invalid'] = [];
    for (const rec of records) {
      const parsed = LegacyRowSchema.safeParse(rec);
      if (!parsed.success) {
        invalid.push({ payload: rec, error: parsed.error.message });
        continue;
      }
      try {
        valid.push(mapLegacyRow(parsed.data));
      } catch (e) {
        invalid.push({ payload: rec, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { valid, invalid };
  },
};
