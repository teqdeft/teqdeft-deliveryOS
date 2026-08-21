# Teqdeft Delivery OS

AI-assisted delivery operating system for an agency: the signed scope, the
approved decisions and the delivery evidence stay connected from intake through
launch.

The product's claim is not task assignment — it is **traceability**. Every
requirement points at the exact sentence in the exact document that produced
it, every approval names a person, and every red project can show the facts
that made it red.

> Built from the *Teqdeft Delivery OS Product Blueprint v1.0*. Section
> references throughout the code (`§7.3`, `§8.3`, …) point back to that
> document.

---

## What works today

This is **Release 1 — trusted project intake**, plus the governance machinery
the later releases build on.

| Capability | Blueprint | Status |
|---|---|---|
| Projects, clients, members, intake checklist | §7.1 | Done |
| Source upload / paste, fragment extraction, citations | §7.1, §6.1 | Done |
| AI requirement extraction with verified provenance | §8 | Done |
| Conflict detection and human resolution | §7.2 | Done |
| Requirements Studio — edit, split, merge, approve, reject | §7.2 | Done |
| Immutable versioned scope baseline | §7.3 | Done |
| Explainable project health | §13.1 | Done |
| Role-based access, capability matrix, audit trail | §4, §8.3 | Done |
| Planning, work items, capacity, My Day, QA | §7.4–7.6 | Not yet — Release 2/3 |
| Client portal, integrations, templates | §12, §14 | Not yet — later |

---

## Running it

**Full instructions, including Windows and XAMPP: [`LOCAL-SETUP.md`](LOCAL-SETUP.md)**

You need Node 20+ and a MySQL 8 (or MariaDB 10.2+). Docker Desktop is the
easiest way to get one; an existing XAMPP/WAMP works too.

```bash
git clone https://github.com/teqdeft/teqdeft-deliveryOS
cd teqdeft-deliveryOS
npm install
npm run setup       # finds a database, writes .env, migrates, seeds demo data
npm run dev         # API on :4000, web on :5173
```

`npm run setup` runs on Windows, macOS and Linux alike, is safe to re-run, and
names the exact fix when it cannot reach the database.

Open <http://localhost:5173> and sign in as any seeded account — the password
for all of them is `DeliveryOS2026!`:

| Account | Role | What it can do |
|---|---|---|
| `kulwant@teqdeft.com` | Founder | Everything |
| `delivery@teqdeft.com` | Delivery Head | All projects, resolve cross-PM conflicts |
| `cto@teqdeft.com` | Technical Lead | Approve baselines, technical decisions |
| `pm@teqdeft.com` | Project Manager | Run intake, review requirements, propose scope |
| `dev@teqdeft.com` | Developer | Assigned work only — no contract values, no approvals |
| `qa@teqdeft.com` | QA Engineer | QA queues |
| `sales@teqdeft.com` | Sales | Handover and evidence upload |

Sign in as the PM and then as the developer to see the access model working:
the same project shows different data.

### Turning on AI analysis

Open `apps/api/.env`, put your key on the `OPENAI_API_KEY` or
`ANTHROPIC_API_KEY` line, and restart `npm run dev`. That file is gitignored,
so the key stays on your machine.

### Without an AI key

The product runs fine with no `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. Analysis
is disabled with an explanation; everything else — intake, manual requirements,
review, baseline approval, health, audit — works normally. This is deliberate
(§16, graceful degradation).

Set either key to enable extraction. The seeded demo project is designed for
it: the proposal, the kickoff call and a follow-up email disagree about the
launch date and the product count, so a real run produces real conflicts.

---

## Layout

```
packages/shared     Domain vocabulary, brand tokens, Zod schemas.
                    Shared by API and web; the schemas double as the
                    AI structured-output contract.
apps/api            Express + Knex on MySQL. Modular by domain.
  src/db            connection, typed row registry, marshalling, migrations
  src/lib           auth, rbac, audit, errors, http
  src/modules       clients, projects, sources, requirements, baselines, audit
  src/ai            gateway, provider adapters, model policy, prompts, jobs
apps/web            React + Vite + Tailwind. Screens map to blueprint §9 ids.
```

### Where the important decisions live

| Question | File |
|---|---|
| Who can do what | `apps/api/src/lib/rbac.ts` |
| Which model runs which job | `apps/api/src/ai/model-policy.ts` |
| What the extractor is told | `apps/api/src/ai/prompts.ts` |
| How citations are verified | `apps/api/src/ai/jobs/extract-requirements.ts` |
| Why a project is red | `apps/api/src/modules/projects/health.ts` |
| How documents become citable | `apps/api/src/modules/sources/extract.ts` |
| Brand colours | `packages/shared/src/brand.ts` |
| The database schema | `apps/api/src/db/migrations/` |
| Row types and column safety | `apps/api/src/db/tables.ts` |
| MySQL type conversions | `apps/api/src/db/marshal.ts` |

---

## Brand colours

`packages/shared/src/brand.ts` is the single source. Tailwind generates its
palette from it, so correcting a hex there updates every surface at once.

The values were derived from the Teqdeft logo (azure `#00A8FF` on near-black
`#0B1220`) because teqdeft.com was unreachable from the build environment. **If
the live site uses different values, correct that one file.**

---

## Testing

```bash
npm test                              # unit tests
python3 apps/api/scripts/smoke.py     # end-to-end, needs API running + seeded
```

`npm test` covers the pure logic plus an integration suite that runs the real
extraction pipeline against PostgreSQL with the model stubbed — including the
case that matters most: a fabricated fragment id must not be able to
manufacture provenance.

The smoke suite drives the real HTTP API and checks the things that must not
regress: authentication, project scoping, the capability matrix, commercial
redaction, AI gating with no key configured, both approval gates, the health
rules, and the audit trail.

---

## Deployment

**Deploying to cPanel or shared hosting?** Follow `deploy/CPANEL.md`. It is
written step by step for cPanel's UI, and `deploy/package.sh` builds the two
archives it asks for.

Before deploying anywhere, run the preflight on the target host:

```bash
npm run preflight
```

It checks the Node version, the MySQL/MariaDB version and charset, whether the
database user can actually create foreign keys, whether uploads are writable,
and whether `JWT_SECRET` is still the placeholder — each of which otherwise
shows up much later as a blank page or silently mangled text.

The schema runs on **MySQL 5.7+ or MariaDB 10.2+**, and every table is created
`utf8mb4` explicitly rather than inheriting the database default, because
shared hosts still create databases as latin1.

### Manual deployment

```bash
npm run build
npm run db:deploy -w @deliveryos/api   # apply migrations
npm start -w @deliveryos/api           # serve the API
```

### Database

MySQL 8 via Knex. The schema lives in `apps/api/src/db/migrations/`, listed
explicitly in that folder's `index.ts` rather than discovered by scanning —
so development, tests and the compiled build all run the same migrations.
**Add every new migration to that array.**

```bash
npm run db:migrate    # apply outstanding migrations
npm run db:status     # what has and has not run
npm run db:rollback   # undo the last batch
```

Three MySQL details worth knowing before you write a query, each handled in
`src/db/marshal.ts`:

- **Booleans are `TINYINT(1)`**, so a column comes back as `0`/`1`. `if (row.isActive)`
  is true for both — use `toBool()`. The typed table registry makes
  `where({ isActive: true })` a compile error rather than a silent empty result.
- **`DECIMAL` comes back as a string** so precision survives. `toDecimalString()`
  renders it the way the API always has; never parse a money column as a float.
- **The collation is `utf8mb4_0900_ai_ci`**, which is case-insensitive, so `LIKE`
  matches the way the previous case-insensitive search did. `likeContains()`
  escapes `%` and `_` so a search for "100%" does not match everything.

`apps/web/dist` is a static bundle — serve it from any CDN or static host with
`/api` proxied to the API service. `render.yaml` describes a working
three-service deployment (web, API, Postgres).

### Before this goes anywhere real

These are known gaps, not oversights:

- **Rate limiting is in-memory.** It resets on restart and does not work across
  multiple API instances. Move it to Redis before running more than one.
- **Storage is local disk.** `STORAGE_DRIVER=s3` is stubbed and throws. The
  interface in `apps/api/src/modules/sources/storage.ts` is what an S3 driver
  needs to implement.
- **AI extraction runs inside the request.** A long analysis holds an HTTP
  connection open. Blueprint §15.1 calls for a queue (BullMQ); the job function
  is already written to be callable from a worker unchanged.
- **`JWT_SECRET` must be replaced.** Generate one with
  `openssl rand -base64 48`.
- **Provider keys belong in the environment, never in the repo.** `.env` is
  gitignored. A key that has ever been pasted into a chat, an issue or a
  screenshot should be rotated at the provider before it goes near production.
- **Retention and deletion (§16.1) are not implemented.** Decide the policy
  before real client documents are ingested.
