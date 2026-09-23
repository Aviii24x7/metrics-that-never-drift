import { sql } from '../src/shared/db/client';
import { runIngestion } from '../src/ingestion/ingestion.service';
import { logger } from '../src/shared/logger';

const outcomes = await runIngestion(sql);
logger.info('ingestion complete', { outcomes });
await sql.end();
