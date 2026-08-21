#!/usr/bin/env bash
# One-command local setup for Teqdeft Delivery OS.
#
#   ./setup.sh
#
# Starts MySQL in Docker, installs dependencies, runs the migrations,
# loads demo data, and tells you what to do next. Safe to run more than once.
set -euo pipefail

cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

bold "Checking what you have installed"

command -v node >/dev/null || die "Node.js is not installed. Get it from https://nodejs.org (version 20 or newer)."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js $NODE_MAJOR is too old. Version 20 or newer is required."
ok "Node.js $(node -v)"

# Having the docker CLI is not the same as having a running daemon. Docker
# Desktop installed but not started is the most common case of all, and it
# fails with an obscure socket error unless we check for it here.
have_mysql() {
  # mysqladmin when it is installed; otherwise just check the port is open, so
  # this works against a MySQL the user runs however they like.
  if command -v mysqladmin >/dev/null; then
    mysqladmin ping -h 127.0.0.1 -P 3306 >/dev/null 2>&1 && return 0
  fi
  (exec 3<>/dev/tcp/127.0.0.1/3306) >/dev/null 2>&1
}

USE_DOCKER=0
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    USE_DOCKER=1
    ok "Docker is running"
  elif have_mysql; then
    warn "Docker is installed but not running — using the MySQL already on localhost:3306"
  else
    die "Docker is installed but not running. Start Docker Desktop and run this again.
     (Or, if you already have MySQL 8, start it on localhost:3306 and re-run.)"
  fi
elif have_mysql; then
  ok "Using the MySQL already running on localhost:3306"
else
  die "No database available.
     Install Docker Desktop from https://docker.com/products/docker-desktop and start it,
     then run this again. Or start your own MySQL 8 on localhost:3306."
fi

bold $'\nStarting the database'
if [ "$USE_DOCKER" = "1" ]; then
  docker compose up -d --wait db >/dev/null 2>&1 || docker compose up -d db >/dev/null
  # --wait is not on every Compose version, so poll the healthcheck ourselves.
  # MySQL's first boot initialises the data directory and takes appreciably
  # longer than a warm start, hence the generous ceiling.
  printf '  waiting for MySQL'
  for _ in $(seq 1 90); do
    if docker compose exec -T db mysqladmin ping -h 127.0.0.1 -uroot -proot >/dev/null 2>&1; then break; fi
    printf '.'; sleep 1
  done
  printf '\n'
  docker compose exec -T db mysqladmin ping -h 127.0.0.1 -uroot -proot >/dev/null 2>&1 \
    || die "MySQL did not become ready. Check: docker compose logs db"
  ok "MySQL ready on localhost:3306"
else
  have_mysql || die "MySQL stopped responding on localhost:3306."
  ok "MySQL ready on localhost:3306"
fi

bold $'\nCreating your local settings file'
if [ -f apps/api/.env ]; then
  ok "apps/api/.env already exists — leaving it alone"
else
  cp .env.example apps/api/.env
  # A real random signing secret, not the placeholder from the example file.
  SECRET=$(openssl rand -base64 48 2>/dev/null | tr -d '\n' || node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
  node -e "
    const fs = require('fs');
    const p = 'apps/api/.env';
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^JWT_SECRET=.*\$/m, 'JWT_SECRET=\"$SECRET\"'));
  "
  ok "Created apps/api/.env with a freshly generated signing secret"
fi

bold $'\nInstalling dependencies'
npm install --no-audit --no-fund >/dev/null
ok "Dependencies installed"

bold $'\nSetting up the database'
npm run build -w @deliveryos/shared >/dev/null
npm run db:migrate -w @deliveryos/api >/dev/null
ok "Schema created"
npm run db:seed -w @deliveryos/api >/dev/null
ok "Demo project loaded"

bold $'\nDone.'
cat <<'MSG'

  Start the app:   npm run dev
  Then open:       http://localhost:5173

  Sign in with any of these (password is the same for all):

    pm@teqdeft.com        Project Manager  — runs intake, reviews requirements
    kulwant@teqdeft.com   Founder          — sees everything
    dev@teqdeft.com       Developer        — no contract values, no approvals

    Password: DeliveryOS2026!

  To turn on AI analysis, open apps/api/.env and put your key on the
  OPENAI_API_KEY line, then restart with npm run dev. Without a key the
  rest of the product still works — you just cannot run an analysis.

MSG
