---
paths:
  - "src/**/*.test.ts"
  - "tests/**/*.ts"
  - "e2e/**/*.ts"
  - "vitest.config.mts"
  - "playwright.config.ts"
---

# Tests

Three tiers, split by what they need to run. Keeping that split is what stops the
default suite from rotting into "skipped because the database was down".

| Tier            | Location             | Command         | Needs                       |
| --------------- | -------------------- | --------------- | --------------------------- |
| **Domain**      | beside the source    | `pnpm test`     | nothing                     |
| **Integration** | `tests/integration/` | `pnpm test`     | nothing (in-process PGlite) |
| **Smoke (E2E)** | `e2e/`               | `pnpm test:e2e` | a real `DATABASE_URL`       |

`pnpm test` and `pnpm check` must stay runnable with **no database and no
network**. Never add a spec to the Vitest suite that needs a live server or a
remote Postgres; that is what `e2e/` is for, and it is deliberately excluded from
`pnpm check`.

## Domain tests

Pure functions, no setup. Assert the edges, not the happy path only: invalid
transitions that must throw, idempotency, boundary dates, whitespace, empty
input. `src/domain/items/item-rules.test.ts` is the reference.

Pass fixed dates. Never `new Date()` in an assertion — the test will pass today
and fail in November.

## Integration tests

`tests/support/test-database.ts` boots real Postgres in-process via PGlite and
applies the committed migrations. Use `createTestDatabase()` in `beforeAll` and
`truncate()` in `beforeEach`.

Test through the **services**, not the repositories, so the test exercises the
path the app actually takes. Reach for a repository only to observe state.

Write one when the behaviour lives in SQL: full-text search and ranking, tag
de-duplication, cascade and `on delete set null`, aggregate counts. Do not write
one to re-check a domain rule that already has a unit test.

## Smoke tests

Deliberately minimal — the flows that prove the app is wired together end to
end, not a second copy of the domain suite. Prefer accessible selectors
(`getByRole`, `getByLabel`) over CSS classes, which change with styling.

Add a smoke test only for a flow whose breakage would make TylerOS unusable. If
a new spec would pass whenever the existing ones pass, it is not earning its
place.
