import { Router } from 'express';
import * as controller from './ingestion.controller';

/** Mounted at /ingest. */
export const ingestionRouter = Router();
ingestionRouter.post('/run', controller.runAll);

/** Mounted at /sources. */
export const sourcesRouter = Router();
sourcesRouter.post('/:source/sync', controller.syncOne);
