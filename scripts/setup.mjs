#!/usr/bin/env node
/**
 * One-command local setup, on any operating system.
 *
 *   npm run setup
 *
 * Node rather than bash because a shell script cannot run in Windows
 * PowerShell or CMD without WSL or Git Bash, and Node is already required.
 *
 * Finds a database however it can — Docker, an existing MySQL, XAMPP/WAMP,
 * MAMP — writes .env, runs the migrations and loads the demo project. Safe to
 * run as many times as you like.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const isWindows = process.platform === 'win32';
const c = process.stdout.isTTY && !isWindows
  ? { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', b: '\x1b[1m', d: '\x1b[2m', x: '\x1b[0m' }
  : { g: '', y: '', r: '', b: '', d: '', x: '' };

const bold = (m) => console.log(`${c.b}${m}${c.x}`);
const ok = (m) => console.log(`  ${c.g}✓${c.x} ${m}`);
const warn = (m) => console.log(`  ${c.y}!${c.x} ${m}`);
const info = (m) => console.log(`  ${c.d}·${c.x} ${m}`);
function die(message, hint) {
  console.error(`\n${c.r}✗ ${message}${c.x}`);
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
}

const run = (cmd, opts = {}) =>
  execSync(cmd, { stdio: opts.loud ? 'inherit' : 'pipe', encoding: 'utf8', ...opts });

const tryRun = (cmd) => {
  try {
    return { ok: true, out: run(cmd) };
  } catch (err) {
    return { ok: false, out: String(err.stdout ?? '') + String(err.stderr ?? '') };
  }
};

/** Is something listening? The only portable way to ask is to try connecting. */
const portOpen = (port, host = '127.0.0.1', timeout = 1500) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------- runtime --- */

bold('Checking what you have installed');

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) {
  die(
    `Node ${process.version} is too old — version 20 or newer is required.`,
    'Download the LTS build from https://nodejs.org and run this again.',
  );
}
ok(`Node ${process.version} on ${process.platform}`);

/* ------------------------------------------------------------ database --- */

bold('\nFinding a database');

const dockerReady = tryRun('docker info').ok && tryRun('docker compose version').ok;
let alreadyRunning = await portOpen(3306);
let useDocker = false;

if (alreadyRunning) {
  // Something already owns 3306 — XAMPP, WAMP, MAMP, Homebrew, a service, or
  // a container from a previous run. Use it rather than fighting it; starting
  // Docker now would only fail on the port bind.
  ok('MySQL is already running on port 3306 — using it');
} else if (dockerReady) {
  useDocker = true;
  info('starting MySQL in Docker…');
  const up = tryRun('docker compose up -d db');
  if (!up.ok) die('Docker could not start MySQL.', up.out.trim().split('\n').slice(-5).join('\n'));

  // MySQL's first boot initialises its data directory and is much slower than
  // a warm start, so this waits generously before giving up.
  process.stdout.write('  waiting for MySQL');
  for (let i = 0; i < 90; i += 1) {
    if (await portOpen(3306)) {
      const ping = tryRun('docker compose exec -T db mysqladmin ping -h 127.0.0.1 -uroot -proot');
      if (ping.ok) break;
    }
    process.stdout.write('.');
    await sleep(1000);
  }
  process.stdout.write('\n');
  if (!(await portOpen(3306))) {
    die('MySQL did not become ready in time.', 'Check what happened with:  docker compose logs db');
  }
  ok('MySQL ready on port 3306');
  alreadyRunning = true;
} else {
  const hint = [
    'You have three options, easiest first:',
    '',
    '  1. Install Docker Desktop and start it, then run this again.',
    '     https://www.docker.com/products/docker-desktop',
    '',
    '  2. If you already use XAMPP, WAMP, MAMP or Laragon, start MySQL there',
    '     and run this again. Its default user is usually root with no password —',
    '     put that in apps/api/.env as DB_USER / DB_PASSWORD.',
    '',
    '  3. Install MySQL 8 directly from https://dev.mysql.com/downloads/mysql/',
    '',
    'MariaDB 10.2+ works too.',
  ].join('\n');
  die('No database found on port 3306, and Docker is not running.', hint);
}

/* ----------------------------------------------------------------- env --- */

bold('\nWriting local settings');

const envPath = path.join('apps', 'api', '.env');
if (existsSync(envPath)) {
  ok(`${envPath} already exists — leaving it alone`);
} else {
  let env = readFileSync('.env.example', 'utf8');
  // A real signing secret, not the placeholder. Sessions are forgeable without.
  env = env.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET="${randomBytes(48).toString('base64')}"`);

  if (!useDocker) {
    warn('Using your existing MySQL, so the credentials in .env may not match.');
    warn(`If setup fails at the migration step, edit ${envPath} — for XAMPP/WAMP it is`);
    warn('usually DB_USER=root with an empty DB_PASSWORD.');
  }

  mkdirSync(path.dirname(envPath), { recursive: true });
  writeFileSync(envPath, env);
  ok(`created ${envPath} with a freshly generated signing secret`);
}

/* ------------------------------------------------------------ install --- */

bold('\nInstalling dependencies');
run('npm install --no-audit --no-fund', { loud: false });
ok('dependencies installed');

/* ---------------------------------------------------------------- data --- */

bold('\nSetting up the database');
run('npm run build -w @deliveryos/shared');
ok('shared package built');

/** Read back what .env actually says, so any error can quote the real values. */
const readEnvValue = (key, fallback) => {
  const match = readFileSync(envPath, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') || fallback : fallback;
};
const dbName = readEnvValue('DB_NAME', 'deliveryos');
const dbUser = readEnvValue('DB_USER', 'root');

const migrate = spawnSync('npm', ['run', 'db:migrate', '-w', '@deliveryos/api'], {
  encoding: 'utf8',
  shell: isWindows,
});
if (migrate.status !== 0) {
  const output = `${migrate.stdout ?? ''}${migrate.stderr ?? ''}`;

  // MySQL uses "Access denied" for two completely different problems, and
  // telling them apart matters — otherwise a missing database sends you off
  // resetting a password that was fine.
  //
  //   1045  Access denied for user 'x'@'y' (using password: YES)   -> credentials
  //   1044  Access denied for user 'x'@'y' to database 'z'         -> database
  const noDb =
    /Unknown database/i.test(output) ||
    /ER_DBACCESS_DENIED/i.test(output) ||
    /Access denied for user .* to database/i.test(output);
  const denied = !noDb && /Access denied|ER_ACCESS_DENIED/i.test(output);
  die(
    'The migrations could not run.',
    denied
      ? [
          `MySQL refused the credentials in ${envPath}.`,
          '',
          'If you are using XAMPP, WAMP, MAMP or Laragon, set:',
          '  DB_USER=root',
          '  DB_PASSWORD=',
          '',
          'Then run npm run setup again.',
        ].join('\n')
      : noDb
        ? [
            `The database "${dbName}" does not exist, or ${dbUser} has no rights to it.`,
            '',
            'Create it once — in phpMyAdmin, or with the MySQL client:',
            `  CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4;`,
            `  GRANT ALL ON \`${dbName}\`.* TO '${dbUser}'@'localhost';`,
            '',
            'Then run npm run setup again.',
          ].join('\n')
        : output.trim().split('\n').slice(-12).join('\n'),
  );
}
ok('schema created');

const seed = spawnSync('npm', ['run', 'db:seed', '-w', '@deliveryos/api'], {
  encoding: 'utf8',
  shell: isWindows,
});
if (seed.status !== 0) {
  die('The demo data could not load.', `${seed.stdout ?? ''}${seed.stderr ?? ''}`.trim().split('\n').slice(-12).join('\n'));
}
ok('demo project loaded');

/* -------------------------------------------------------------- finish --- */

bold('\nDone.');
console.log(`
  Start the app:   ${c.b}npm run dev${c.x}
  Then open:       ${c.b}http://localhost:5173${c.x}

  Sign in with any of these (same password for all):

    pm@teqdeft.com        Project Manager  — runs intake, reviews requirements
    kulwant@teqdeft.com   Founder          — sees everything
    dev@teqdeft.com       Developer        — no contract values, no approvals

    Password: ${c.b}DeliveryOS2026!${c.x}

  To turn on AI analysis, put your key on the OPENAI_API_KEY or
  ANTHROPIC_API_KEY line in ${envPath}, then restart. Without a key the rest
  of the product works — you just cannot run an analysis.
`);
