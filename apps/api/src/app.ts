import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env, aiAvailable } from './env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './lib/http.js';
import { authenticate } from './lib/auth.js';
import { authRouter } from './modules/auth/routes.js';
import { clientsRouter } from './modules/clients/routes.js';
import { projectsRouter } from './modules/projects/routes.js';
import { sourcesRouter } from './modules/sources/routes.js';
import { requirementsRouter } from './modules/requirements/routes.js';
import { baselinesRouter } from './modules/baselines/routes.js';
import { auditRouter } from './modules/audit/routes.js';
import { aiRouter } from './ai/routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.WEB_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'deliveryos-api',
      env: env.NODE_ENV,
      // §16 graceful degradation: the client uses this to explain why the
      // Analyse button is disabled instead of failing on click.
      aiAvailable,
    });
  });

  app.use('/api/auth', authRouter);

  // Everything past this point requires a signed-in user. Project-level
  // authorization happens per route via requireProjectAccess (§15.3).
  app.use('/api', authenticate);
  app.use('/api/clients', clientsRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/projects', sourcesRouter);
  app.use('/api/projects', requirementsRouter);
  app.use('/api/projects', baselinesRouter);
  app.use('/api/projects', aiRouter);
  app.use('/api/audit', auditRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
