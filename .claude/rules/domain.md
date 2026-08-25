---
paths:
  - "src/domain/**/*.ts"
---

# Working in `src/domain/`

This layer is pure. It is the reason the interesting logic in TylerOS can be
tested in milliseconds with no database and no browser, and the reason future AI
code cannot reach into the core model.

## Invariants

- **No infrastructure imports.** Not `next`, `react`, `react-dom`, `drizzle-orm`,
  `postgres`, `server-only`, nor `@/server/*`, `@/app/*`, `@/components/*`,
  `@/lib/*`. ESLint enforces this; if a change needs one of them, the code
  belongs in `src/server/` instead.
- **Rules return patches, not mutated objects.** `completeItem(item, now)`
  returns `{ status, completedAt, archivedAt }` and the caller persists it. See
  `src/domain/items/item-rules.ts` for the established shape.
- **Time and randomness are arguments, never ambient.** Every function that needs
  "now" takes it as a parameter (`buildTodayView(items, today)`). Calling
  `new Date()` inside a domain function makes it untestable.
- **Due dates are calendar dates**, `YYYY-MM-DD` strings via
  `src/domain/shared/date.ts`, never `Date` timestamps. See ADR 005.
- **Throw `DomainError` for broken invariants.** Never return a silent failure
  and never swallow one. `src/domain/shared/errors.ts` has the codes.

## Realistic mistakes this prevents

- Reaching for `drizzle-orm` to "just check whether the row exists" — that check
  belongs in a repository, and the rule should take the loaded state as input.
- Adding a generic `groupBy` or `pick` helper. Prefer a named domain concept:
  `buildTodayView` beats a utility that could mean anything.
- Widening a type to `any` to make a signature fit. Use `unknown` and narrow.

## Before adding a file here

Read the neighbouring module first. Each concept owns a small folder
(`src/domain/items/`, `src/domain/today/`, `src/domain/shared/`, and so on) with its types,
its Zod schemas, its rules, and its tests beside them. Follow that shape rather
than inventing a new one.

Anything added here needs a test in the same folder. That is not a formality:
this is the layer where tests are cheap, so it is the layer where behaviour gets
pinned down.
