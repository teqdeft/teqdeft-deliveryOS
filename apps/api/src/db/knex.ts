import knexFactory, { type Knex } from 'knex';
import { databaseConnection, env, isProduction } from '../env.js';
import './tables.js';
import { migrationSource } from './migrations/index.js';

/**
 * The single Knex instance, and the shape migrations and seeds share.
 *
 * Kept separate from db/index.ts so knexfile.ts can import the configuration
 * without pulling in the whole application.
 */
export function knexConfig(overrides: Partial<Knex.Config> = {}): Knex.Config {
  return {
    client: 'mysql2',
    connection: {
      ...(typeof databaseConnection() === 'string'
        ? { uri: databaseConnection() as string }
        : (databaseConnection() as object)),
      // The corpus carries em-dashes, pilcrows and client names in scripts
      // beyond Latin-1. Anything short of utf8mb4 mangles them silently.
      charset: 'utf8mb4',
      // Without this, mysql2 hands back DATETIME as a local-time string and
      // every timestamp in the API drifts by the server's offset.
      timezone: 'Z',
      dateStrings: false,
      // DECIMAL and BIGINT stay strings so precision survives; a money column
      // silently rounded through a float is not a bug you find quickly.
      decimalNumbers: false,
      supportBigNumbers: true,
      bigNumberStrings: true,
    },
    pool: {
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX,
      // Fail fast rather than hanging a request forever on an exhausted pool.
      acquireTimeoutMillis: 30_000,
      idleTimeoutMillis: 30_000,
    },
    migrations: {
      // Explicit list rather than directory scanning — see migrations/index.ts
      // for why. Keeps dev, test and the compiled build on one code path.
      migrationSource,
      tableName: 'knex_migrations',
      // Every migration runs inside its own transaction. MySQL commits DDL
      // implicitly, so this does not make schema changes atomic — but it does
      // keep the migration bookkeeping consistent.
      disableTransactions: false,
    },
    asyncStackTraces: !isProduction,
    ...overrides,
  };
}

export const db: Knex = knexFactory(knexConfig());

/**
 * Either the pool or an open transaction. Every function that writes takes one
 * of these, so a caller can compose several writes atomically — the same
 * contract `recordAudit(input, tx)` had under Prisma.
 */
export type Db = Knex | Knex.Transaction;

export const transaction = <T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> =>
  db.transaction(fn);

export async function closeDb(): Promise<void> {
  await db.destroy();
}

/** Cheap liveness probe for /health and for tests to skip when MySQL is absent. */
export async function pingDb(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
