---
paths:
  - "src/server/**/*.ts"
---

# Working in `src/server/`

Three roles, kept distinct. Collapsing them is the most likely way this codebase
degrades.

| File pattern      | Role                                                       |
| ----------------- | ---------------------------------------------------------- |
| `*-repository.ts` | Speaks SQL. Returns domain shapes. **No business rules.**  |
| `*-service.ts`    | Orchestrates: load state → ask the domain → write a patch. |
| `actions/*.ts`    | `"use server"`. Validates input, calls a service.          |

## Invariants

- **`db` is the first parameter.** Every repository and service takes
  `db: Database`. Never import `getDb()` into one. `getDb()` is called only by
  server actions and route components. This is what lets integration tests run
  against an in-process database and lets a transaction handle pass straight
  through — a `PgTransaction` satisfies `Database`.
- **Services contain no rules.** If you are writing an `if` about what _should_
  happen, it belongs in `src/domain/` with a test. A service that decides
  policy is the layering breaking down quietly.
- **Actions re-validate everything** with a Zod schema from `src/domain/`, even
  when the only caller is this repo's own client component.
- **Actions return `ActionResult<T>`; they never throw at the client.** Wrap the
  body in `runAction` from `src/server/action-result.ts`.
- **Never call `redirect()` in an action.** It works by throwing, so `runAction`
  would catch it and log it as an unexpected failure. Navigation belongs to the
  calling component. See ADR 012.
- **No UI imports.** Not `@/components/*` or `@/app/*`. ESLint enforces it.
- **Translate constraint violations into `DomainError`.** Drizzle wraps driver
  errors, so the Postgres code sits down the `cause` chain — see
  `src/server/projects/project-service.ts` for the working pattern.

## Realistic mistakes this prevents

- Querying from a route component or an action directly instead of going through
  a repository, because it is "just one select". The next change needs it in two
  places and the SQL diverges.
- Adding an `ai/` module that imports from `src/domain/`. AI belongs in
  `src/server/ai/*` (does not exist yet) and may only be imported _by_ the
  server layer, never _by_ the domain.
- Widening `Database` or casting it to a concrete driver type to make a call
  typecheck. If the abstract type does not have the method, use a `sql` fragment
  through `db.execute`.
