# Architecture

## The idea the whole system rests on

**The inbox is a status, not an entity.**

Everything captured is an `Item`. An item has a `kind` (what it is) and a
`status` (where it stands). `status = 'inbox'` means "captured but not yet
triaged". A task is an item with `kind = 'task'`. A show to watch is an item with
`kind = 'media'`.

This is what stops TylerOS becoming a pile of unrelated CRUD pages:

- Capture is always one code path, so it can be made fast once.
- Search is always one query, across everything.
- A new module extends the spine instead of forking it.

### What is deliberately _not_ an item

Items are "things I captured, think about, or need to act on". Structured records
are not items and must get their own tables:

- pantry and freezer stock
- warranties, receipts, appliance manuals
- recurring routines

"Buy more olive oil" is an item. The jar of olive oil in the pantry is not. If a
future module starts cramming inventory rows into `items` with mostly-null
columns, that is the signal the boundary was crossed.

## Layers

Dependencies run one way only. ESLint enforces this (`eslint.config.mjs`), so a
violation fails `pnpm lint` rather than being noticed a year later.

```
src/app/        Routes. React Server Components by default.
     |
     v
src/server/     Repositories, services, server actions. Drizzle lives here.
     |
     v
src/domain/     Pure TypeScript and Zod. No React, no Next, no database.
```

### `src/domain/` — the part worth testing

Types, Zod schemas, and pure functions. It imports nothing from the framework or
the database, which is why its tests run in milliseconds with no setup.

| Module                  | Holds                                                   |
| ----------------------- | ------------------------------------------------------- |
| `items/item.ts`         | The Item type, kinds, statuses, labels                  |
| `items/item-rules.ts`   | Lifecycle transitions, returned as patches              |
| `items/item-schema.ts`  | Validation for everything entering the system           |
| `items/item-filters.ts` | The filter vocabulary, shared by SQL, URL and predicate |
| `capture/`              | Parsing captured text (`#tag` extraction)               |
| `today/`                | Bucketing open items for the Today view                 |
| `projects/`             | Projects and progress                                   |
| `tags/`                 | Tag name normalisation                                  |
| `shared/date.ts`        | Calendar dates. Every function takes "now" explicitly   |
| `shared/errors.ts`      | `DomainError`, thrown when an invariant is broken       |

Rules return a **patch**, not a mutated object. `completeItem(item, now)` returns
`{ status, completedAt, archivedAt }` and the caller persists it. This keeps
persistence out of the rules and makes every rule a one-line test.

### `src/server/` — everything that touches the database

- **Repositories** speak SQL and return domain shapes. No business rules.
- **Services** orchestrate: load state, ask the domain, write the patch.
- **Actions** (`"use server"`) validate input and call a service.

Every repository and service takes the database handle as its **first argument**:

```ts
export async function listItems(db: Database, filters: ItemListFilters);
```

Not a DI container — just a parameter. It is the reason integration tests can run
against an in-process database, and the reason a transaction handle can be passed
straight through where a `Database` is expected.

### `src/app/` — routes

Server Components fetch, Server Actions mutate. There is **no REST or tRPC
layer**: a single user does not need a network boundary inside their own app.
Because services are plain functions over `db`, adding `app/api/*` later is a
thin wrapper, not a refactor.

`export const dynamic = "force-dynamic"` sits in the root layout. TylerOS renders
live personal data; nothing is prerendered, and `next build` never needs a
database.

## State management

There is none, and that is the design.

| Need             | Mechanism                                        |
| ---------------- | ------------------------------------------------ |
| Server data      | Server Components, fetched per request           |
| Mutations        | Server Actions + `revalidatePath("/", "layout")` |
| Form state       | `useActionState`                                 |
| Instant feedback | `useOptimistic`, `useTransition`                 |
| Filters, search  | URL search params                                |

No Redux, Zustand, or React Query. Adding a client store to a server-rendered
single-user app buys nothing and costs a permanent synchronisation problem.

Revalidation is deliberately coarse: any mutation invalidates the whole layout,
because item counts appear in the sidebar on every page. At personal scale this
is free and removes a category of stale-badge bugs.

## Data model

```
projects ──1:N── items ──N:M── tags
                   |
              kind, status, due_on
```

**items** — the spine. `kind` ∈ task, note, idea, media, purchase. `status` ∈
inbox, active, someday, done, archived. `due_on` is a **date, not a timestamp**:
personal life is day-granular, and a timestamp imports a timezone bug for free.
`search_vector` is a generated `tsvector` maintained by Postgres, so search can
never drift from content.

**projects** — containers, not a taxonomy. An item belongs to at most one, and
nesting is not supported. Deleting a project keeps its items (`on delete set
null`).

**tags** — the cross-cutting axis, normalised aggressively so `#Home` and `#home`
are one tag. A tag with no items left is deleted; an orphan tag is clutter in
every filter list.

Three organising axes (kind, project, tag) is the ceiling. No nested folders, no
custom fields, no taxonomy engine.

## Error handling

| Where         | Convention                                                             |
| ------------- | ---------------------------------------------------------------------- |
| Domain        | Throw `DomainError` with a code. Never return a silent failure         |
| Repository    | Let driver errors propagate                                            |
| Service       | Translate constraint violations into `DomainError` (see project names) |
| Server action | Return `ActionResult`, never throw at the client                       |
| Route         | `error.tsx`; layout failure falls through to `global-error.tsx`        |

`runAction` in `src/server/action-result.ts` handles the three kinds of failure:
invalid input (Zod → field errors), a broken rule (`DomainError` → its message),
and everything else (logged with its stack, reduced to a neutral message).

Nothing is ever swallowed. There are no empty `catch` blocks in this codebase.

**Server actions never call `redirect()`.** Redirects work by throwing, and
`runAction` would swallow one. Navigation belongs to the component that knows
where the user should end up.

## Testing

| Kind        | What it covers                                    | Needs            |
| ----------- | ------------------------------------------------- | ---------------- |
| Domain      | Transitions, parsing, bucketing, validation edges | Nothing          |
| Integration | The SQL itself: full-text search, tags, cascades  | Nothing (PGlite) |

Integration tests run Postgres in-process through PGlite and apply the committed
migrations from scratch, so every run also proves the migrations still work. They
have already earned their keep: they caught `ORDER BY` rendering as
`due_on nulls last asc`, and a unique-violation code arriving one level down the
error `cause` chain.

There are no component tests. UI behaviour worth asserting on belongs in
Playwright once the UI has stopped moving; brittle render tests of a UI this young
would cost more than they catch.

## How future AI connects without contaminating the domain

Designed as a seam, **not built**:

1. AI code lives in `src/server/ai/*`. It may be imported _by_ `src/server/`, and
   never _by_ `src/domain/`. The lint rule already forbids the reverse.
2. AI output is a **proposal**, never an overwrite. A future `item_suggestions`
   table holds suggested kinds, projects and tags for the user to accept or
   ignore. User-entered data is never silently replaced by a model's guess.
3. Semantic search becomes a `pgvector` column alongside `search_vector`, and the
   retrieval service chooses a strategy. Owning the SQL is what makes this a
   migration rather than a rewrite.

No interfaces, adapters or strategy patterns exist for this yet. Writing an
abstraction for a single hypothetical implementation is the trap; the seam is the
dependency rule, which costs nothing today.

## Traps this design is built against

| Trap                          | Defence                                                             |
| ----------------------------- | ------------------------------------------------------------------- |
| Unrelated CRUD pages          | One Item spine; the inbox is a status                               |
| AI dependence                 | No AI in the core; every feature works without it                   |
| Hard to migrate               | Plain SQL migrations, owned and readable                            |
| Hard to test                  | Pure domain; `db` passed as an argument                             |
| Tight coupling                | One-way layering, enforced by lint                                  |
| Over-engineering              | No API layer, no client store, no auth, no abstraction with one use |
| Too complex for one developer | Small files, explicit domain concepts over generic utilities        |
