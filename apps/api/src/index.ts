import { createApp } from './app.js';
import { env, aiAvailable, isProduction } from './env.js';
import { closeDb, pingDb } from './db/index.js';
import { logger } from './lib/logger.js';

const app = createApp();

/**
 * cPanel and other Passenger-based hosts hand the port in as PORT and expect
 * the app to bind it. They also proxy from the front-end web server, so
 * binding all interfaces rather than localhost is required there — the
 * connection arrives from outside the loopback.
 */
const host = process.env.HOST ?? (isProduction ? '0.0.0.0' : '127.0.0.1');

const server = app.listen(env.PORT, host, () => {
  logger.info(
    { host, port: env.PORT, env: env.NODE_ENV, aiAvailable },
    `Delivery OS API listening on http://${host}:${env.PORT}`,
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
