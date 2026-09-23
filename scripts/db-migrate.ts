import { sql } from '../src/shared/db/client';
import { runMigrations } from '../src/shared/db/migrate';
import { logger } from '../src/shared/logger';

const applied = await runMigrations(sql);
logger.info('migrations applied', { applied });
await sql.end();
