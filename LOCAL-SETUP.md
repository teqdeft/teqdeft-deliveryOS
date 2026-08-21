# Running Delivery OS on your own machine

Works on Windows, macOS and Linux. Nothing here needs a server, a domain or a
paid account.

---

## What you need

**Node.js 20 or newer** — <https://nodejs.org>, take the LTS build.
Check it with `node -v`.

**A MySQL database.** Any one of these:

| | |
|---|---|
| **Docker Desktop** *(easiest)* | <https://docker.com/products/docker-desktop> — the setup script starts MySQL for you |
| **XAMPP / WAMP / Laragon / MAMP** | If you already have one for PHP work, start MySQL in its control panel |
| **MySQL 8 installed directly** | <https://dev.mysql.com/downloads/mysql/> |

MariaDB 10.2 or newer works too, so an existing XAMPP is fine.

---

## Setup

```bash
git clone https://github.com/teqdeft/teqdeft-deliveryOS
cd teqdeft-deliveryOS
git checkout claude/document-review-134uee

npm install
npm run setup
npm run dev
```

Then open **<http://localhost:5173>**.

`npm run setup` finds your database however it can, writes `apps/api/.env` with
a freshly generated signing secret, creates the tables and loads a demo
project. Run it as many times as you like — it does not overwrite an existing
`.env` and does not duplicate the demo data.

### Signing in

| Account | Role | What it shows |
|---|---|---|
| `pm@teqdeft.com` | Project Manager | Runs intake, reviews requirements, proposes scope |
| `kulwant@teqdeft.com` | Founder | Everything, including contract values |
| `cto@teqdeft.com` | Technical Lead | Approves baselines |
| `dev@teqdeft.com` | Developer | Assigned work only — no contract values, no approvals |

Password for all of them: **`DeliveryOS2026!`**

Sign in as the PM, then as the developer, and open the same project — that is
the access model working, not a rendering difference.

---

## If you use XAMPP or WAMP

The setup script will find MySQL on port 3306 and use it, but XAMPP's default
credentials differ from the ones in `.env.example`. If setup stops at the
migration step saying the credentials were refused, open `apps/api/.env` and
set:

```ini
DB_USER=root
DB_PASSWORD=
```

Then create the database once — in **phpMyAdmin → New**, or from the MySQL
console:

```sql
CREATE DATABASE deliveryos CHARACTER SET utf8mb4;
```

Run `npm run setup` again. It will tell you exactly which of these two things
is wrong rather than making you guess.

---

## Turning on the AI analysis

Optional. Everything else works without it — you can add requirements by hand,
review them, and approve a baseline as normal.

Open `apps/api/.env` and put your key on one line:

```ini
OPENAI_API_KEY=sk-proj-...
```

or

```ini
ANTHROPIC_API_KEY=sk-ant-...
```

Stop the app (Ctrl+C) and run `npm run dev` again. Then open the demo project
→ **AI analysis** → **Run analysis**.

`apps/api/.env` is gitignored, so the key stays on your machine.

The demo project is built for this test: the proposal says 60 products, the
call says 90 and the email says 74; the call gives one launch date and the
email corrects it. A working run should surface those as **conflicts for you to
decide**, not quietly pick one.

---

## Everyday commands

| | |
|---|---|
| `npm run dev` | Start both servers — API on 4000, web on 5173 |
| `npm test` | Run the test suite |
| `npm run db:migrate` | Apply any new database changes |
| `npm run db:seed` | Reload the demo project |
| `npm run db:status` | Show which migrations have run |
| `npm run build` | Production build of both apps |

Stop everything with Ctrl+C.

---

## When something is wrong

| Symptom | Cause |
|---|---|
| `EADDRINUSE :4000` or `:5173` | Something else is on that port. Close the other app, or change `PORT` in `apps/api/.env` |
| Setup says credentials refused | Wrong `DB_USER` / `DB_PASSWORD` — see the XAMPP section above |
| Setup says the database does not exist | Create it; the error prints the exact SQL |
| `Table doesn't exist` | `npm run db:migrate` has not run |
| Sign-in fails for a seeded account | The seed has not run — `npm run db:seed` |
| Blank page, console 404s on `/api` | The API is not running. Check the terminal where `npm run dev` is |
| "Analysis is disabled" | No AI key set — see above. Everything else still works |

To start completely fresh:

```sql
DROP DATABASE deliveryos;
CREATE DATABASE deliveryos CHARACTER SET utf8mb4;
```

then `npm run setup`.

---

## Letting others on your network see it

By default the app only answers on your own machine. To demo it to someone on
the same office Wi-Fi, start the web server with `--host`:

```bash
npm run dev:web -- --host
```

Vite prints a **Network:** address to give them. You will also need to add that
address to `WEB_ORIGIN` in `apps/api/.env` and restart, or the browser will
refuse the session cookie.

This is fine for a demo across the room. It is not a deployment — no HTTPS, no
process manager, and it stops when you close the laptop. For a real internal
rollout, `deploy/CPANEL.md` covers putting it on your hosting.
