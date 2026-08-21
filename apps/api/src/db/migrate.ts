import 'dotenv/config';
import { db, closeDb } from './knex.js';
import { logger } from '../lib/logger.js';

/**
 * Migration runner.
 *
 * Run through tsx (dev) or node (production) rather than the Knex CLI: the
 * CLI's TypeScript loader cannot resolve this project's ESM `.js` import
 * specifiers, and going through the application's own Knex instance means the
 * CLI and the server can never point at different databases.
 *
 *   npm run db:migrate     apply everything outstanding
 *   npm run db:rollback    undo the last batch
 *   npm run db:status      show what has and has not run
 */
const command = process.argv[2] ?? 'latest';

async function main() {
  switch (command) {
    case 'latest': {
      const [batch, applied] = (await db.migrate.latest()) as [number, string[]];
      if (applied.length === 0) {
        logger.info('Database is already up to date.');
      } else {
        logger.info({ batch }, `Applied ${applied.length} migration(s):`);
        applied.forEach((name) => logger.info(`  ${name}`));
      }
      break;
    }
    case 'rollback': {
      const [batch, reverted] = (await db.migrate.rollback()) as [number, string[]];
      if (reverted.length === 0) logger.info('Nothing to roll back.');
      else logger.info({ batch }, `Rolled back ${reverted.length} migration(s).`);
      break;
    }
    case 'status': {
      const [completed, pending] = await Promise.all([
        db.migrate.list().then(([done]) => done as string[]),
        db.migrate.list().then(([, todo]) => (todo as { file: string }[]).map((m) => m.file)),
      ]);
      logger.info(`Applied: ${completed.length}`);
      completed.forEach((n) => logger.info(`  ✓ ${n}`));
      logger.info(`Pending: ${pending.length}`);
      pending.forEach((n) => logger.info(`  · ${n}`));
      break;
    }
    default:
      throw new Error(`Unknown command "${command}". Use latest, rollback or status.`);
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'Migration failed');
    process.exitCode = 1;
  })
  .finally(closeDb);
