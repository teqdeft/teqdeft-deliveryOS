# Teqdeft Delivery OS — working notes

Read `README.md` first for what the product is and how to run it. This file is
about how to work in the codebase.

## The one idea

Traceability. A requirement without a verified citation is not a requirement.
If a change would let an unciteable, unapproved or unattributable record reach
the database, it is wrong regardless of how convenient it is.

Concretely, these invariants are enforced in code and must stay enforced:

1. **AI drafts, humans decide.** No code path may produce an `APPROVED`
   requirement, a resolved conflict or an approved baseline without a named
   human actor. (`§8.3`)
2. **Citations point at fragment ids, not text.** A citation whose fragment is
   not in the run's corpus is dropped, not stored. (`extract-requirements.ts`)
3. **Approved baselines are snapshots.** `BaselineRequirement` copies the text;
   editing the `Requirement` row later must never change an approved version.
4. **Every consequential mutation writes an audit event, in the same
   transaction.** `recordAudit(input, tx)` — pass the `tx`.
5. **Authorization is server-side on reads too.** Spread `projectScope(user)`
   into every list query. The client's capability list is for hiding buttons,
   never for access control.

## Conventions

- **Vocabulary lives in `packages/shared`.** One spelling for an enum value
  across the database, the API, the wire and the UI. Do not invent a second.
- **Errors are typed.** Throw `badRequest`/`forbidden`/`notFound`/`gateFailed`
  from `lib/errors.ts`. `gateFailed` (422) means "understood and permitted, but
  its preconditions fail" — that is the code a refused approval gate returns.
- **Project-scoped 403s surface as 404.** Confirming a project exists leaks the
  client roster.
- **Comments explain why, not what.** The existing comments cite blueprint
  sections; keep that when the reason comes from the spec.

## Working with the database

MySQL 8 through Knex. There is no ORM and no generated client — `src/db/` is
the whole data layer.

- **`db/tables.ts` is the type safety.** Every table's row shape is declared
  there and registered with Knex, so `db('Project').where({ stag: 'X' })` is a
  compile error. When you add or change a column, update the row type in the
  same commit as the migration — nothing regenerates it for you.
- **Migrations are an explicit list.** Add each new file to the array in
  `db/migrations/index.ts`. Knex's directory scanning is deliberately not used:
  it resolves `.ts` in development and `.js` in the build, and finds nothing at
  all under the test runner, which fails as "table doesn't exist" much later.
- **Never rename or reorder an applied migration.** The name is the primary key
  in `knex_migrations`; renaming one makes it run again.
- **Use the helpers in `db/marshal.ts`.** MySQL differs from PostgreSQL in
  three ways that are silent rather than loud:
  `TINYINT(1)` booleans arrive as `0`/`1` (`toBool`), `DECIMAL` arrives as a
  string and must render the way the API always has (`toDecimalString`), and
  `LIKE` needs `%`/`_` escaped (`likeContains`).
- **JSON columns take a string.** Write them through `fromJson()`; passing a
  bare object stores `"[object Object]"`.
- **MySQL has no `RETURNING`.** Use `insertReturning` / `updateReturning`; they
  generate the id up front so the read back is exact.
- **Load relations in one query per relation**, not one per row —
  `groupBy`/`indexBy` in `db/helpers.ts` are what replaced Prisma's `include`.

## Adding an AI job

1. Add the job type to `AI_JOB_TYPES` (shared) and to `db/enums.ts`.
2. Define its output schema in `packages/shared/src/schemas/` using `.nullable()`
   rather than `.optional()` — OpenAI strict mode requires every field present.
   Add the job type to `db/enums.ts` too, and write a migration to extend the
   `AiJobType` column: it is a real MySQL ENUM, so an unknown value is rejected
   by the database rather than quietly stored.
3. Add a `ModelPolicy` row for both providers in `ai/model-policy.ts`.
4. Write the prompt in `ai/prompts.ts` with a version constant, and bump the
   version whenever the wording changes.
5. Write the job in `ai/jobs/`, following `extract-requirements.ts`: create the
   `AiRun` first, validate the result with Zod, verify every citation against
   the corpus, then persist inside one transaction.

## Testing

`npm test` for units, including an integration suite that runs the extraction
pipeline against a real MySQL database with the model stubbed. Those tests skip
themselves when MySQL is unreachable rather than failing.
`python3 apps/api/scripts/smoke.py` for the end-to-end
suite — it needs the API running and the database seeded, and it is the fastest
way to know whether a change broke a gate.

When you change a gate, add a check to the smoke suite. It is written to be
readable as a list of the product's promises.

## Gotchas found the hard way

- Anything run outside the server — the migration runner, the seed — imports
  `dotenv/config` itself. Don't remove those imports or they lose the database
  configuration.
- MySQL's first container boot initialises its data directory and is much
  slower than Postgres's. `setup.sh` waits up to 90 seconds for a reason.
- The workspace pins a single `vite` via `overrides` in the root
  `package.json`. Two copies produce unrelated TypeScript plugin types and the
  web build stops typechecking.
- `pdf-parse` runs a demo file if you import its package entry point. Import
  `pdf-parse/lib/pdf-parse.js`.
- The login rate limiter is in-memory, so it resets when the API restarts —
  useful to know when a test run trips it.
