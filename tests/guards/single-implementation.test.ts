import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { CANONICAL_STATUSES } from '../../src/metrics/metrics.definition';

const ROOT = process.cwd();
const SRC = path.resolve(ROOT, 'src');
const MIGRATIONS = path.resolve(SRC, 'shared/db/migrations');

async function tsFiles(dir: string = SRC): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await tsFiles(full)));
    else if (e.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function rel(p: string): string {
  return path.relative(ROOT, p);
}

async function filesMatching(re: RegExp): Promise<string[]> {
  const files = await tsFiles();
  const hits: string[] = [];
  for (const f of files) {
    if (re.test(await readFile(f, 'utf8'))) hits.push(rel(f));
  }
  return hits.sort();
}

/**
 * These tests ARE the mechanism the brief asks for: a second implementation of
 * the number is caught in CI, not by a code-review convention. Each failure
 * names the offending file and explains the rule.
 */
describe('single-implementation guard', () => {
  it('the canonical status literal "collected" appears in exactly one TS file', async () => {
    // A quoted canonical literal — only the definition may name it.
    const hits = await filesMatching(/(['"`])collected\1/);
    expect(hits).toEqual(['src/metrics/metrics.definition.ts']);
  });

  it('COLLECTED_STATUSES is declared in exactly one TS file', async () => {
    const hits = await filesMatching(/export const COLLECTED_STATUSES/);
    expect(hits).toEqual(['src/metrics/metrics.definition.ts']);
  });

  it('collected_revenue() is called from exactly one TS module', async () => {
    const hits = await filesMatching(/collected_revenue\s*\(/);
    expect(hits).toEqual(['src/metrics/metrics.repository.ts']);
  });

  it('the transactions table is read for revenue in exactly one TS module', async () => {
    // Matches a table read (FROM/JOIN), including a schema-qualified or quoted
    // name, so a second implementation cannot dodge the guard with public.transactions.
    // An INSERT (ingestion) is a write, not a revenue read, and is not matched.
    const hits = await filesMatching(/\b(from|join)\s+(?:"?\w+"?\.)?"?transactions"?\b/i);
    expect(hits).toEqual(['src/metrics/metrics.repository.ts']);
  });

  it('provider status literals appear only under src/sources (never in the metric)', async () => {
    // Derive the forbidden words from the actual seed vocabulary so the guard
    // grows with the sources. Exclude words that are ALSO canonical statuses
    // (pending/failed/refunded), which legitimately appear as canonical literals
    // and generic status strings — only unambiguous provider words are forbidden.
    const seed = await readFile(path.join(MIGRATIONS, '003_seed_status_map.sql'), 'utf8');
    const canonical = new Set<string>(CANONICAL_STATUSES);
    const providerWords = [
      ...new Set([...seed.matchAll(/'[^']+',\s*'([^']+)',/g)].map((m) => m[1]!)),
    ].filter((w) => !canonical.has(w));
    const re = new RegExp(`(['"\`])(${providerWords.join('|')})\\1`);
    const hits = await filesMatching(re);
    const offenders = hits.filter((f) => !f.startsWith(path.join('src', 'sources') + path.sep));
    expect(offenders).toEqual([]);
  });

  it('exactly one SQL migration defines a function that reads transactions', async () => {
    const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
    const defs: string[] = [];
    for (const f of files) {
      const sql = await readFile(path.join(MIGRATIONS, f), 'utf8');
      if (/create\s+(or\s+replace\s+)?function/i.test(sql) && /\btransactions\b/i.test(sql)) {
        defs.push(f);
      }
    }
    expect(defs).toEqual(['002_collected_revenue.sql']);
  });

  it('the collected_revenue SQL function contains no canonical status literal', async () => {
    const fn = await readFile(path.join(MIGRATIONS, '002_collected_revenue.sql'), 'utf8');
    expect(fn).not.toMatch(/'(collected|pending|failed|refunded|voided)'/);
  });

  it('the SQL CHECK constraint lists exactly the CANONICAL_STATUSES (one source of truth)', async () => {
    // The canonical set is named a second time in the 001 CHECK. Assert the two
    // agree, so they cannot drift apart.
    const core = await readFile(path.join(MIGRATIONS, '001_core.sql'), 'utf8');
    const match = /canonical\s+in\s*\(([^)]+)\)/i.exec(core);
    expect(match).not.toBeNull();
    const inCheck = [...match![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!).sort();
    expect(inCheck).toEqual([...CANONICAL_STATUSES].sort());
  });
});
