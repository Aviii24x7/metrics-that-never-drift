import express, { type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { correlation } from './shared/http/correlation';
import { errorHandler, notFound } from './shared/http/error-handler';
import { openApiSpec } from './shared/http/openapi';
import { metricsRouter } from './metrics/metrics.routes';
import { ingestionRouter, sourcesRouter } from './ingestion/ingestion.routes';

/** Build the Express app. Exported so tests can mount it without a live port. */
export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(correlation);

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Interactive API docs (Swagger UI) + the raw spec.
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec as Record<string, unknown>, {
      customSiteTitle: 'Metrics That Never Drift — API',
    }),
  );

  app.use('/metrics', metricsRouter);
  app.use('/ingest', ingestionRouter);
  app.use('/sources', sourcesRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
