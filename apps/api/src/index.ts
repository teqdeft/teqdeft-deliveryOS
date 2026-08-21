import { createApp } from './app.js';
import { env, aiAvailable } from './env.js';
import { closeDb, pingDb } from './db/index.js';
import { logger } from './lib/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, aiAvailable },
    `Delivery OS API listening on http://localhost:${env.PORT}`,
  );
  if (!aiAvailable) {
    logger.warn('No AI provider key configured — analysis is disabled, everything else works.');
  }
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
  // Do not let a hung connection hold the process open forever.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
