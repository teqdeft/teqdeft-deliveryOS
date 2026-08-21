# Deploying Delivery OS to cPanel

Written for a cPanel account with **Setup Node.js App** and **MySQL Databases**.
If your host does not offer Setup Node.js App, this will not work — Node cannot
run on cPanel without it, and you need a VPS instead. Check that first.

Everything below has been verified against MariaDB 10.11 using the same bundle
this produces, including the case where the database is created as latin1.

---

## Before you start

Collect these. The runbook stops dead without them.

| | |
|---|---|
| The subdomain | e.g. `delivery.teqdeft.com`, created in cPanel → **Domains** |
| SSH or Terminal access | cPanel → **Terminal**, or SSH. Possible without it, but painful |
| Node 20+ availability | cPanel → **Setup Node.js App** → check the version dropdown |

If the Node version dropdown tops out below 20, stop and ask your host to add
it. Nothing else here will help.

---

## 1. Build the bundle (on your machine, not the server)

```bash
git clone https://github.com/teqdeft/teqdeft-deliveryOS
cd teqdeft-deliveryOS
git checkout claude/document-review-134uee
npm ci
./deploy/package.sh
```

This writes two archives to `deploy/dist/`:

- `deliveryos-api.tar.gz` — the Node application
- `deliveryos-web.tar.gz` — the front end

Build here rather than on the server. Shared hosting caps memory low enough
that a TypeScript build gets killed part-way through, and it is never obvious
that is what happened.

---

## 2. Create the database

cPanel → **MySQL Databases**:

1. **Create a database** — name it `deliveryos`. cPanel prefixes it with your
   account, so the real name becomes something like `teqdeft_deliveryos`.
2. **Create a user** with a long generated password. Also prefixed.
3. **Add the user to the database** with **ALL PRIVILEGES**.

Write down the *prefixed* names. Typing the unprefixed name into `.env` is the
single most common reason step 6 fails.

> If cPanel offers a charset choice, pick `utf8mb4`. If it does not, carry on —
> the migration sets `utf8mb4` on every table itself, precisely because shared
> hosts still default databases to latin1.

---

## 3. Create the Node application

cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|---|---|
| Node.js version | 20 or newer |
| Application mode | Production |
| Application root | `deliveryos-api` |
| Application URL | your subdomain, **path** `/api` |
| Application startup file | `app.cjs` |

Save. cPanel creates `~/deliveryos-api` and shows a command like
`source /home/<account>/nodevenv/deliveryos-api/20/bin/activate`. **Copy that
command** — you need it every time you run npm or node for this app.

---

## 4. Upload

cPanel → **File Manager**:

- Upload `deliveryos-api.tar.gz` into `~/deliveryos-api` and extract it there.
- Upload `deliveryos-web.tar.gz` into the subdomain's document root
  (usually `~/public_html/delivery` or similar) and extract it there.

The web archive contains a `.htaccess`. File Manager hides dotfiles by default
— turn on **Settings → Show Hidden Files** and confirm it extracted.

---

## 5. Configure

In `~/deliveryos-api`, copy `.env.example` to `.env` and edit it:

```ini
NODE_ENV=production
PORT=4000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=teqdeft_deliveryos      # the PREFIXED name
DB_USER=teqdeft_deliveryos      # the PREFIXED name
DB_PASSWORD=the-password-you-generated
DB_SSL=false                    # cPanel MySQL is local; no TLS needed

# Must be your real public URL. The session cookie is refused otherwise.
WEB_ORIGIN=https://delivery.teqdeft.com

# Generate a fresh one — never reuse the placeholder:
#   openssl rand -base64 48
JWT_SECRET=...

STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./storage

# Optional. Without a key, analysis is disabled and everything else works.
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

`.env` must sit in `~/deliveryos-api`, next to `app.cjs` — not in `public_html`,
where it would be downloadable.

---

## 6. Install, check, migrate

In cPanel → **Terminal** (or over SSH):

```bash
source /home/<account>/nodevenv/deliveryos-api/20/bin/activate   # from step 3
cd ~/deliveryos-api

npm install --omit=dev

npm run preflight     # <- read this output before continuing
```

**Do not skip the preflight.** It checks the Node version, the database version
and charset, whether the user can actually create foreign keys, whether the
upload directory is writable, and whether `JWT_SECRET` is still the
placeholder. Each of those otherwise shows up much later as a blank page or
silently mangled text.

Once it says *Ready to deploy*:

```bash
npm run db:migrate    # creates the 25 tables
npm run db:seed       # demo accounts and a sample project — optional
```

Skip `db:seed` if you want to start empty. You will then need to create the
first user yourself; the seed is the only thing that creates one.

---

## 7. Start it

cPanel → **Setup Node.js App** → your app → **Restart**.

Then check, from Terminal:

```bash
curl -s http://127.0.0.1:4000/health
```

Expect `{"ok":true,...,"env":"production","aiAvailable":false}`.

Now in a browser, open `https://delivery.teqdeft.com`. Sign in with a seeded
account — `pm@teqdeft.com` / `DeliveryOS2026!` — and **change those passwords
immediately**, or delete the seeded users once you have made real ones.

---

## 8. Turn on HTTPS

cPanel → **SSL/TLS Status** → select the subdomain → **Run AutoSSL**.

This is not optional. `WEB_ORIGIN` is https, and the session cookie is marked
`Secure` in production, so the app cannot log anyone in over plain http.

---

## When something is wrong

Passenger reports almost every failure as a bare 503 with an empty page, so go
straight to the logs rather than guessing.

| Symptom | Where to look |
|---|---|
| 503 on every page | `~/deliveryos-api/stderr.log`, and cPanel → **Errors** |
| "Cannot find package" | `npm install --omit=dev` did not run, or ran outside the nodevenv |
| "Access denied for user" | The database name or user is missing the account prefix |
| "Table doesn't exist" | `npm run db:migrate` has not run |
| Sign-in appears to work, then bounces | `WEB_ORIGIN` does not match the address in the browser, or the site is not on https |
| Accented text shows as `?` | The tables predate this migration — check `SHOW CREATE TABLE Source` says utf8mb4 |
| App stops after a while | Shared hosts reap idle processes. Setup Node.js App restarts it on the next request; if it happens constantly, you need a VPS |

---

## Deploying an update

```bash
# on your machine
./deploy/package.sh
# upload and extract deliveryos-api.tar.gz over ~/deliveryos-api
# upload and extract deliveryos-web.tar.gz over the document root

# on the server
source /home/<account>/nodevenv/deliveryos-api/20/bin/activate
cd ~/deliveryos-api
npm install --omit=dev
npm run db:migrate        # no-op when there is nothing new
# then Restart in Setup Node.js App
```

Extracting over the top leaves `.env` and `storage/` alone — neither is in the
archive. Back up `storage/` before any large change; it holds every uploaded
source document, and nothing else has a copy.

---

## What shared hosting cannot give you

Worth knowing before this carries real client work:

- **One process only.** The login rate limiter is in-memory, so it is correct
  on a single instance and wrong the moment there are two. cPanel runs one.
- **Uploads live on the account's disk.** No redundancy beyond your host's own
  backups. `STORAGE_DRIVER=s3` is stubbed and throws.
- **AI analysis runs inside the request.** A long extraction holds an HTTP
  connection open, and shared hosts often cut those at 60–120 seconds. If
  analysis times out on large document sets, that is why, and the fix is a
  queue (blueprint §15.1) or a VPS.
- **No zero-downtime deploys.** A restart drops in-flight requests.

None of this blocks an internal pilot. All of it matters before clients depend
on it.
