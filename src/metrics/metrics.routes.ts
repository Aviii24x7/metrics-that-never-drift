import { Router } from 'express';
import * as controller from './metrics.controller';

export const metricsRouter = Router();

// GET /metrics/revenue/summary?from=&to=&tz=&currency=
metricsRouter.get('/revenue/summary', controller.summary);

// GET /metrics/revenue/breakdown?from=&to=&tz=&bucket=&currency=
metricsRouter.get('/revenue/breakdown', controller.breakdown);
