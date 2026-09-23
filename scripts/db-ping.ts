import { sql } from '../src/shared/db/client';
import { logger } from '../src/shared/logger';

const [row] = await sql<{ now: Date; db: string; version: string }[]>`
  select now() as now, current_database() as db, version() as version
`;
logger.info('database reachable', {
  db: row?.db,
  now: row?.now?.toISOString(),
  version: row?.version?.split(' ').slice(0, 2).join(' '),
});
await sql.end();
