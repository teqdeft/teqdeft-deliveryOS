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
  across Prisma, the API, the wire and the UI. Do not invent a second.
- **Errors are typed.** Throw `badRequest`/`forbidden`/`notFound`/`gateFailed`
  from `lib/errors.ts`. `gateFailed` (422) means "understood and permitted, but
  its preconditions fail" — that is the code a refused approval gate returns.
- **Project-scoped 403s surface as 404.** Confirming a project exists leaks the
  client roster.
- **Comments explain why, not what.** The existing comments cite blueprint
  sections; keep that when the reason comes from the spec.

## Adding an AI job

1. Add the job type to `AI_JOB_TYPES` (shared) and the Prisma enum.
2. Define its output schema in `packages/shared/src/schemas/` using `.nullable()`
   rather than `.optional()` — OpenAI strict mode requires every field present.
3. Add a `ModelPolicy` row for both providers in `ai/model-policy.ts`.
4. Write the prompt in `ai/prompts.ts` with a version constant, and bump the
   version whenever the wording changes.
5. Write the job in `ai/jobs/`, following `extract-requirements.ts`: create the
   `AiRun` first, validate the result with Zod, verify every citation against
   the corpus, then persist inside one transaction.

## Testing

`npm test` for units. `python3 apps/api/scripts/smoke.py` for the end-to-end
suite — it needs the API running and the database seeded, and it is the fastest
way to know whether a change broke a gate.

When you change a gate, add a check to the smoke suite. It is written to be
readable as a list of the product's promises.

## Gotchas found the hard way

- `prisma.config.ts` disables Prisma's automatic `.env` loading. Both it and
  `prisma/seed.ts` import `dotenv/config` explicitly. Don't remove those.
- The workspace pins a single `vite` via `overrides` in the root
  `package.json`. Two copies produce unrelated TypeScript plugin types and the
  web build stops typechecking.
- `pdf-parse` runs a demo file if you import its package entry point. Import
  `pdf-parse/lib/pdf-parse.js`.
- The login rate limiter is in-memory, so it resets when the API restarts —
  useful to know when a test run trips it.
