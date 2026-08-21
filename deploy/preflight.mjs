#!/usr/bin/env node
/**
 * Checks a host is capable of running Delivery OS before you deploy to it.
 *
 * Run this on the server, from the application directory, once .env is filled
 * in:
 *
 *   node deploy/preflight.mjs
 *
 * Shared hosting fails in quiet ways — an old Node, a MariaDB without the
 * privileges to create a foreign key, a database created as latin1. Each of
 * those surfaces much later as a broken page or mangled text, so they are all
 * checked here while the cost of finding out is a few seconds.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, statfsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let failures = 0;
let warnings = 0;

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => { warnings++; console.log(`  \x1b[33m!\x1b[0m ${m}`); };
const bad = (m) => { failures++; console.log(`  \x1b[31m✗\x1b[0m ${m}`); };
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

/* ---------------------------------------------------------------- node --- */

section('Runtime');
const major = Number(process.versions.node.split('.')[0]);
if (major >= 20) ok(`Node ${process.version}`);
else bad(`Node ${process.version} is too old. Select Node 20 or newer in cPanel's Node.js app settings.`);

/* ------------------------------------------------------------------ env --- */

section('Configuration');
const envPath = path.resolve('.env');
if (!existsSync(envPath)) {
  bad('.env not found in this directory. Copy .env.example to .env and fill it in.');
} else {
  const env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      }),
  );
  for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'WEB_ORIGIN']) {
    if (!env[key]) bad(`${key} is not set in .env`);
  }
  if (env.JWT_SECRET) {
    if (env.JWT_SECRET.includes('change-me')) {
      bad('JWT_SECRET is still the placeholder. Generate one: openssl rand -base64 48');
    } else if (env.JWT_SECRET.length < 32) {
      bad('JWT_SECRET is too short. Generate one: openssl rand -base64 48');
    } else {
      ok('JWT_SECRET is set and long enough');
    }
  }
  if (env.NODE_ENV !== 'production') warn(`NODE_ENV is "${env.NODE_ENV ?? 'unset'}" — set it to production`);
  else ok('NODE_ENV=production');

  if (env.WEB_ORIGIN?.includes('localhost')) {
    bad(`WEB_ORIGIN is still ${env.WEB_ORIGIN}. Set it to the public URL, or the browser's session cookie will be refused.`);
  } else if (env.WEB_ORIGIN?.startsWith('http://')) {
    warn(`WEB_ORIGIN is plain http. Session cookies are marked Secure in production and will not be sent over http.`);
  } else if (env.WEB_ORIGIN) {
    ok(`WEB_ORIGIN is ${env.WEB_ORIGIN}`);
  }
}

/* ------------------------------------------------------------------- fs --- */

section('Files');
if (existsSync('dist/index.js')) ok('dist/index.js present (the API is built)');
else bad('dist/index.js missing. Run `npm run build` before uploading, or run it here.');

// npm hoists dependencies to a workspace root, so a missing local
// node_modules is not by itself a problem — walk up before deciding.
const hasDependency = (name) => {
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    if (existsSync(path.join(dir, 'node_modules', name))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
};
if (hasDependency('knex') && hasDependency('mysql2')) ok('dependencies installed');
else bad('dependencies missing. Run npm ci --omit=dev, or use cPanel\'s "Run NPM Install".');

const storage = process.env.STORAGE_LOCAL_PATH ?? './storage';
try {
  const { writeFileSync, mkdirSync, unlinkSync } = await import('node:fs');
  mkdirSync(storage, { recursive: true });
  const probe = path.join(storage, `.preflight-${Date.now()}`);
  writeFileSync(probe, 'x');
  unlinkSync(probe);
  ok(`upload storage is writable (${storage})`);
} catch (err) {
  bad(`upload storage is not writable at ${storage}: ${err.message}`);
}

try {
  const s = statfsSync('.');
  const freeGb = (s.bavail * s.bsize) / 1e9;
  if (freeGb < 1) warn(`only ${freeGb.toFixed(2)} GB free — uploaded sources need room`);
  else ok(`${freeGb.toFixed(1)} GB free disk`);
} catch { /* statfs is unavailable on some hosts; not worth failing over */ }

/* ------------------------------------------------------------ database --- */

section('Database');
let mysql;
try {
  mysql = require('mysql2/promise');
} catch {
  bad('mysql2 is not installed — run the dependency install first');
}

if (mysql && process.env.DB_HOST) {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
    });

    const [[ver]] = await conn.query('SELECT VERSION() AS v');
    const isMaria = /mariadb/i.test(ver.v);

    // Compare part by part, never as a float: 10.11 parsed as a number is
    // less than 10.2, so a float comparison rejects a perfectly good MariaDB.
    const atLeast = (version, minimum) => {
      const parts = version.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
      const min = minimum.split('.').map(Number);
      for (let i = 0; i < min.length; i += 1) {
        const a = parts[i] ?? 0;
        if (a > min[i]) return true;
        if (a < min[i]) return false;
      }
      return true;
    };

    // The schema needs DATETIME(3) and JSON: MySQL 5.7+ or MariaDB 10.2+.
    if (isMaria && atLeast(ver.v, '10.2')) ok(`MariaDB ${ver.v}`);
    else if (!isMaria && atLeast(ver.v, '5.7')) ok(`MySQL ${ver.v}`);
    else bad(`${ver.v} is too old. MySQL 5.7+ or MariaDB 10.2+ is required.`);

    const [[cs]] = await conn.query(
      'SELECT DEFAULT_CHARACTER_SET_NAME AS cs FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [process.env.DB_NAME],
    );
    // Not fatal: the migration sets utf8mb4 on every table explicitly. Worth
    // saying, because anything created outside the migration would inherit it.
    if (cs?.cs === 'utf8mb4') ok('database default charset is utf8mb4');
    else warn(`database default charset is ${cs?.cs} — the app's own tables force utf8mb4, so this is safe, but ask your host to change it if you can`);

    // Foreign keys are the thing shared hosting most often cannot do, and the
    // schema is 53 of them. Prove it rather than assume it.
    await conn.query('DROP TABLE IF EXISTS _preflight_child, _preflight_parent');
    await conn.query('CREATE TABLE _preflight_parent (id CHAR(36) PRIMARY KEY) ENGINE=InnoDB');
    await conn.query(
      'CREATE TABLE _preflight_child (id CHAR(36) PRIMARY KEY, parentId CHAR(36), ' +
        'CONSTRAINT fk_preflight FOREIGN KEY (parentId) REFERENCES _preflight_parent(id) ON DELETE CASCADE) ENGINE=InnoDB',
    );
    ok('can create InnoDB tables with foreign keys');
    await conn.query('DROP TABLE _preflight_child');
    await conn.query('DROP TABLE _preflight_parent');

    // MySQL 8 renamed this; MariaDB and MySQL 5.7 still use the old name, and
    // selecting the wrong one is a hard error rather than a null.
    try {
      const [[tx]] = await conn.query('SELECT @@transaction_isolation AS iso');
      ok(`transaction isolation: ${tx.iso}`);
    } catch {
      const [[tx]] = await conn.query('SELECT @@tx_isolation AS iso');
      ok(`transaction isolation: ${tx.iso}`);
    }

    const [[packet]] = await conn.query("SHOW VARIABLES LIKE 'max_allowed_packet'");
    const mb = Number(packet.Value) / 1e6;
    if (mb < 4) warn(`max_allowed_packet is ${mb.toFixed(1)} MB — large source documents may be rejected`);
    else ok(`max_allowed_packet ${mb.toFixed(0)} MB`);

    const [tables] = await conn.query(
      'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?',
      [process.env.DB_NAME],
    );
    console.log(`  \x1b[2m·\x1b[0m ${tables[0].n} tables currently in ${process.env.DB_NAME}`);

    await conn.end();
  } catch (err) {
    bad(`cannot connect: ${err.message}`);
    if (/ER_ACCESS_DENIED/.test(err.code ?? '')) {
      console.log('    On cPanel the real user and database names are prefixed with your account,');
      console.log('    e.g. teqdeft_deliveryos — not the bare name you typed into the form.');
    }
  }
}

/* --------------------------------------------------------------- result --- */

console.log('');
if (failures > 0) {
  console.log(`\x1b[31m${failures} blocking problem(s)\x1b[0m${warnings ? `, ${warnings} warning(s)` : ''}. Fix these before deploying.`);
  process.exit(1);
}
console.log(`\x1b[32mReady to deploy.\x1b[0m${warnings ? ` ${warnings} warning(s) above are worth reading.` : ''}`);
