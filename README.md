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

You need **Node 20 or newer** and either **Docker Desktop** (easiest) or your
own PostgreSQL on `localhost:5432`.

```bash
git clone https://github.com/teqdeft/teqdeft-deliveryOS
cd teqdeft-deliveryOS
./setup.sh          # starts the database, installs everything, loads demo data
npm run dev         # API on :4000, web on :5173
```

`setup.sh` is safe to run as many times as you like. It checks your setup,
starts PostgreSQL in Docker if it can, generates a real signing secret, creates
the schema, and loads a demo project. If something is missing it tells you
exactly what to install.

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
apps/api            Express + Prisma. Modular by domain.
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

```bash
npm run build
npm run db:deploy -w @deliveryos/api   # apply migrations
npm start -w @deliveryos/api           # serve the API
```

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
