#!/usr/bin/env bash
# Builds a deployable bundle for cPanel and writes it to deploy/dist/.
#
#   ./deploy/package.sh
#
# Produces two archives, because cPanel wants them in two different places:
#
#   deliveryos-api.tar.gz   -> the Node application directory
#   deliveryos-web.tar.gz   -> the document root (public_html)
#
# Built here rather than on the server on purpose: shared hosting usually caps
# memory low enough that a TypeScript build gets killed halfway, and it is
# never obvious that is what happened.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="deploy/dist"
rm -rf "$OUT" && mkdir -p "$OUT/stage/api" "$OUT/stage/web"

echo "Building…"
npm run build -w @deliveryos/shared >/dev/null
npm run build -w @deliveryos/api >/dev/null
npm run build -w @deliveryos/web >/dev/null

echo "Staging the API…"
cp -r apps/api/dist              "$OUT/stage/api/dist"
cp    apps/api/package.json      "$OUT/stage/api/"
cp    apps/api/app.cjs           "$OUT/stage/api/"
cp    .env.example               "$OUT/stage/api/"
# Only the files the server needs, not the whole deploy/ folder — copying it
# wholesale would recurse into the output directory that lives inside it.
mkdir -p "$OUT/stage/api/deploy"
cp deploy/preflight.mjs "$OUT/stage/api/deploy/"
cp deploy/CPANEL.md     "$OUT/stage/api/deploy/" 2>/dev/null || true

# The API imports @deliveryos/shared, a workspace package that does not exist
# on the server. Ship its build alongside and depend on it by path.
#
# It is deliberately NOT dropped straight into node_modules: `npm install` on
# the server prunes anything node_modules holds that package.json does not
# declare, so a vendored copy is deleted moments before the app needs it — and
# the only symptom is a 503 with "Cannot find package" buried in stderr.
mkdir -p "$OUT/stage/api/vendor/shared"
cp -r packages/shared/dist         "$OUT/stage/api/vendor/shared/dist"
cp    packages/shared/package.json "$OUT/stage/api/vendor/shared/"

node -e "
  const fs = require('fs');
  const p = '$OUT/stage/api/package.json';
  const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
  pkg.dependencies['@deliveryos/shared'] = 'file:./vendor/shared';
  pkg.scripts = {
    start: 'node dist/index.js',
    'db:migrate': 'node dist/db/migrate.js latest',
    'db:status': 'node dist/db/migrate.js status',
    'db:seed': 'node dist/db/seed.js',
    preflight: 'node deploy/preflight.mjs',
  };
  // The workspace root's lockfile does not describe this package, so it is
  // not shipped; npm resolves from package.json on the server instead.
  delete pkg.devDependencies;
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
"

echo "Staging the web bundle…"
cp -r apps/web/dist/. "$OUT/stage/web/"
cp deploy/htaccess-template "$OUT/stage/web/.htaccess"

tar -czf "$OUT/deliveryos-api.tar.gz" -C "$OUT/stage/api" .
tar -czf "$OUT/deliveryos-web.tar.gz" -C "$OUT/stage/web" .
rm -rf "$OUT/stage"

echo
echo "Built:"
ls -lh "$OUT" | awk 'NR>1 {printf "  %-28s %s\n", $9, $5}'
echo
echo "Next: follow deploy/CPANEL.md"
