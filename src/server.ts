import { createApp } from './app';
import { env } from './shared/config/env';
import { sql } from './shared/db/client';
import { logger } from './shared/logger';

async function main(): Promise<void> {
  // Fail fast if the database is unreachable, with a readable message.
  try {
    await sql`select 1`;
  } catch (e) {
    logger.error('cannot reach the database at boot', {
      error: e instanceof Error ? e.message : String(e),
    });
    process.exit(1);
  }

  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info('server listening', { port: env.PORT });
  });
}

void main();
