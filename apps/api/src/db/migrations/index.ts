import type { Knex } from 'knex';
import * as init from './20260821080000_init_traceability_chain.js';

/**
 * The migration list, imported explicitly rather than discovered by scanning
 * the directory.
 *
 * Knex's default migrator reads the folder and `import()`s each file at
 * runtime. That works under plain node, but it breaks wherever module
 * resolution is not the filesystem's: the compiled build looks for `.js` while
 * development has `.ts`, and a test runner with its own module graph finds
 * nothing at all and silently migrates zero tables — which surfaces much later
 * as "table doesn't exist".
 *
 * Listing them here means the bundler resolves every migration at build time,
 * and the same code runs identically in development, tests and production.
 *
 * **Add each new migration to this array.** Order is the execution order and
 * must never be rearranged; the name is what is recorded in knex_migrations,
 * so renaming one makes it run a second time.
 */
const MIGRATIONS: { name: string; migration: Knex.Migration }[] = [
  { name: '20260821080000_init_traceability_chain', migration: init },
];

/** Knex's MigrationSource contract, backed by the list above. */
export const migrationSource: Knex.MigrationSource<string> = {
  async getMigrations() {
    return MIGRATIONS.map((m) => m.name);
  },
  getMigrationName(name) {
    return name;
  },
  async getMigration(name) {
    const found = MIGRATIONS.find((m) => m.name === name);
    if (!found) throw new Error(`Unknown migration "${name}"`);
    return found.migration;
  },
};
