/**
 * Entry point for cPanel's "Setup Node.js App" (Phusion Passenger).
 *
 * Passenger requires a CommonJS startup file and resolves it relative to the
 * application root, so this file exists purely to hand off to the real ESM
 * server in dist/. Point cPanel's "Application startup file" at `app.cjs`.
 *
 * Keeping it this thin matters: Passenger reports a failure here as a bare
 * 503 with nothing in the browser, so the less that can go wrong before the
 * real server's own logging starts, the better.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import('./dist/index.js').catch((err) => {
  // Passenger surfaces stderr in cPanel's stderr.log; without this the only
  // symptom of a bad build or a missing .env is an empty 503.
  console.error('[deliveryos] failed to start:', err);
  process.exit(1);
});
