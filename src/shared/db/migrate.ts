import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './client';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

/** List the migration SQL files in lexical (numbered) order. */
export async function migrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

/**
 * Apply every migration in order. Migrations are written to be idempotent
 * (`create ... if not exists`, `create or replace`, `on conflict do update`),
 * so running this twice is safe. Runs against whatever schema the given `sql`
 * connection has on its search_path — the tests use that to migrate into an
 * isolated schema.
 */
export async function runMigrations(sql: Db): Promise<string[]> {
  const files = await migrationFiles();
  const applied: string[] = [];
  for (const file of files) {
    const content = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    // Simple protocol so a file may contain multiple statements (incl. the
    // `$$`-quoted function body).
    await sql.unsafe(content).simple();
    applied.push(file);
  }
  return applied;
}
