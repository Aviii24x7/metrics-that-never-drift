import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { env } from '../../src/shared/config/env';
import { runMigrations } from '../../src/shared/db/migrate';
import type { Db } from '../../src/shared/db/client';

/**
 * Tests run against a fresh, uniquely-named schema so they never touch real data
 * and never collide with each other. Session state (`search_path`) must persist
 * across queries, so we use a DIRECT connection (not the transaction pooler) and
 * a single connection.
 */
function directUrl(url: string): string {
  return url.replace('-pooler.', '.');
}

function sslMode(url: string): 'require' | undefined {
  return /sslmode=require|neon\.tech|supabase/.test(url) ? 'require' : undefined;
}

export interface TestDb {
  sql: Db;
  schema: string;
  drop(): Promise<void>;
}

export async function makeTestDb(): Promise<TestDb> {
  const url = directUrl(env.DATABASE_URL);
  const schema = `test_${randomBytes(6).toString('hex')}`;
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    ssl: sslMode(url),
    onnotice: () => {},
  });
  await sql.unsafe(`create schema "${schema}"`);
  await sql.unsafe(`set search_path to "${schema}"`);
  await runMigrations(sql);
  return {
    sql,
    schema,
    async drop() {
      try {
        await sql.unsafe(`drop schema if exists "${schema}" cascade`);
      } finally {
        await sql.end({ timeout: 5 });
      }
    },
  };
}
