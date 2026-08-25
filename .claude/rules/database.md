---
paths:
  - "src/server/db/**"
  - "drizzle/**"
  - "drizzle.config.ts"
  - "scripts/seed.mts"
---

# Schema and migrations

Migrations are plain SQL, committed, and applied from scratch by every
integration test run. That is deliberate: it means a broken migration fails
`pnpm test` rather than surfacing in production.

## The only correct workflow

1. Edit `src/server/db/schema.ts`.
2. `pnpm db:generate` — then **read the generated SQL** before committing it.
   Drizzle's output for generated columns and index expressions is worth a look.
3. `pnpm db:migrate`.
4. Commit the migration file **in the same change** as the schema edit.

## Invariants

- **Never edit a migration that has been applied.** Not to fix a typo, not to
  reorder. Add a new one. The files in `drizzle/meta/` track applied state and
  hand-editing corrupts it.
- **Enum values are imported from `src/domain/`**, never redeclared here. That is
  what stops the database and the type system drifting apart:
  `pgEnum("item_kind", ITEM_KINDS)`.
- **No `user_id` column anywhere.** TylerOS is single-user by decision, not by
  omission — ADR 003.
- **Due dates are `date`, not `timestamp`.** ADR 005.
- **New SQL needs an integration test.** The bugs in this layer _are_ the SQL:
  `ORDER BY ... NULLS LAST`, `count(*) FILTER`, generated `tsvector` columns,
  cascade behaviour. A mock would assert that the code calls the mock.

## Structured records are not items

Before adding a column to `items`, check it applies to most kinds. Pantry stock,
warranties and receipts get their **own tables** — they are not "things I
captured or need to act on". Mostly-null columns on `items` are the signal that
this boundary has been crossed. See `docs/ARCHITECTURE.md`.

## Seeding

`scripts/seed.mts` goes through the services rather than inserting rows, so
seeding exercises the same rules the app does and breaks loudly when they change.
Keep it that way — a seed that writes rows directly will silently drift from
reality.
