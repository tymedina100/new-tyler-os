@AGENTS.md

# TylerOS — instructions for coding agents

A private, single-user personal-life operating system. Read this before writing
code. Read `docs/ARCHITECTURE.md` before adding anything structural.

## Product philosophy

1. **Useful before intelligent.** Every feature must work with AI switched off.
2. **Personal-first.** One user. Not a SaaS product.
3. **Fast to capture into.** Friction at capture is the worst kind of bug here.
4. **Easy to retrieve from.** Nothing may disappear into a disconnected module.
5. **Modular without being over-engineered.** Clean boundaries, no framework.
6. **AI-ready, never AI-dependent.**
7. **Privacy-conscious.** No telemetry, minimal dependencies.
8. **Built to be used daily.** UX matters as much as the code.

## The one idea to preserve

**The inbox is a status, not an entity.** Everything captured is an `Item` with a
`kind` and a `status`; `status = 'inbox'` means untriaged. One capture path, one
search query, one spine that modules extend rather than fork.

Structured records — pantry stock, warranties, receipts — are **not items** and
get their own tables. If a change wants to add mostly-null columns to `items`,
stop: that is the boundary being crossed.

## Architecture in one diagram

```
src/app/     Routes, React Server Components, Server Actions as the only mutation path
   |
   v
src/server/  Repositories, services, actions. Drizzle lives here and nowhere else
   |
   v
src/domain/  Pure TypeScript + Zod. No React, no Next, no database driver
```

Dependencies run **one way**. ESLint enforces it, so violations fail `pnpm lint`.

- `src/domain/` may not import `next`, `react`, `drizzle-orm`, `postgres`,
  `@/server/*`, `@/components/*`, `@/app/*`, `@/lib/*`.
- `src/server/` may not import `@/components/*` or `@/app/*`.

## Non-negotiable conventions

**Repositories and services take `db` as their first argument.** Never import a
database singleton into them. `getDb()` is called by server actions and route
components only. This is what makes the code testable and lets a transaction
handle pass straight through.

**Domain rules return patches, not mutated objects.** `completeItem(item, now)`
returns `{ status, completedAt, archivedAt }`; the caller persists it.

**Business rules live in `src/domain/`, not in services.** A service loads state,
asks the domain, and writes the result. If a service contains an `if` about what
_should_ happen, that `if` belongs in the domain with a test.

**Every server action re-validates its input** with a Zod schema from the domain,
even when the only caller is this codebase's own client component.

**Server actions return `ActionResult<T>`; they never throw at the client and
never call `redirect()`.** Redirects work by throwing and would be caught by
`runAction`. Navigation belongs to the calling component.

**Never swallow an error.** No empty `catch`. Unexpected errors are logged with
context by `runAction` and reduced to a neutral message for the user.

**No `any`.** Not as a cast, not as a generic argument. `unknown` plus a narrowing
check instead.

**Due dates are calendar dates** (`YYYY-MM-DD` strings), never timestamps. Date
helpers in `src/domain/shared/date.ts` take "now" as an explicit argument.

## Naming

- Files: `kebab-case.ts`. Tests sit beside their subject as `*.test.ts`.
- React components: `PascalCase`, named exports (except route files).
- Database: `snake_case`, plural tables. Enum values are imported from the domain
  into `schema.ts` so DDL and types cannot drift.
- Say what a thing is: `item-repository.ts`, not `utils.ts`.

## Rules against complexity

- **No abstraction with one implementation.** No interface, adapter, factory or
  strategy pattern for a single case. The seam is the dependency rule.
- **No generic utility where a domain concept fits.** `buildTodayView` beats
  `groupBy`.
- **No new dependency** unless it is used immediately and nothing in the standard
  library or existing deps does the job. Check `package.json` first.
- **No new architectural pattern** without reading `docs/ARCHITECTURE.md` and
  following what is already there. If a genuinely new pattern is needed, add an
  ADR to `docs/DECISIONS.md` in the same change.
- **No large files.** A file past ~250 lines usually wants splitting by concept.
- Do not add: authentication, an API layer, a client state library, multi-tenancy,
  a plugin system, or AI. Each is a recorded decision in `docs/DECISIONS.md`.

## Testing requirements

- **Domain logic must have tests.** Transitions, parsing, bucketing, validation
  edges. These are pure and need no setup.
- **New SQL must have an integration test.** They run real Postgres in-process via
  PGlite (`tests/support/test-database.ts`) and apply the committed migrations, so
  they need no Docker and no running server. Mocking the repository layer is not
  an acceptable substitute: the bugs in that layer _are_ the SQL.
- No component tests. UI assertions wait for Playwright once the UI stabilises.

## Commands

```bash
pnpm dev              # development server
pnpm check            # types + lint + tests + build — run before finishing
pnpm test             # vitest, once (no database needed)
pnpm typecheck        # next typegen && tsc --noEmit
pnpm lint             # eslint, includes the layering rules
pnpm format           # prettier
pnpm db:generate      # generate a migration after editing schema.ts
pnpm db:migrate       # apply migrations
pnpm db:seed          # sample data
```

Running the app needs a real Postgres (`docker compose up -d`, or any Postgres via
`DATABASE_URL`). Tests do not.

## Changing the schema

1. Edit `src/server/db/schema.ts`.
2. `pnpm db:generate` — read the generated SQL before committing it.
3. `pnpm db:migrate`.
4. Commit the migration file with the schema change. Never hand-edit an applied
   migration; add a new one.

Migrations are also applied from scratch by every integration test run, so a
broken migration fails `pnpm test`.

## How to approach a change here

1. **Read before adding.** Find the existing pattern for what you are doing and
   follow it. This codebase is small enough to read.
2. **Decide which layer it belongs to.** A rule goes in `domain`, a query in a
   repository, orchestration in a service, rendering in `app`.
3. **Ask whether it earns its place.** Prefer deleting a feature to generalising
   it. "It might be useful later" is not a reason — the roadmap is.
4. **Test the domain part.**
5. **Run `pnpm check`.** Fix failures rather than documenting them.
6. **Update the docs that are now wrong.** A significant decision gets an ADR.

## Current milestone

**0.1 — Life Inbox. Shipped.** Capture, triage, Today, Inbox, Tasks, Projects,
Search. See `docs/ROADMAP.md` for what comes next; 0.2 is about removing the need
to triage by hand, still without AI.
