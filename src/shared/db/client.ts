import postgres from 'postgres';
import { env } from '../config/env';

/** The Postgres client type used throughout the app (a tagged-template `sql`). */
export type Db = ReturnType<typeof postgres>;

function sslMode(url: string): 'require' | undefined {
  // Neon and Supabase require TLS. Detect it from the URL so local Postgres
  // (no TLS) keeps working without extra config.
  return /sslmode=require|neon\.tech|supabase|\.pooler\./.test(url) ? 'require' : undefined;
}

/**
 * Build a Postgres client. `prepare: false` is important behind a transaction
 * pooler (Neon pooler / Supabase session pooler / PgBouncer), which does not
 * support server-side prepared statements.
 */
export function createClient(overrides: Record<string, unknown> = {}): Db {
  return postgres(env.DATABASE_URL, {
    ssl: sslMode(env.DATABASE_URL),
    max: 10,
    prepare: false,
    ...overrides,
  });
}

/** The shared application connection pool. */
export const sql: Db = createClient();
