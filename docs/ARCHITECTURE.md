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

- kitchen inventory — **built in 0.3**, as `kitchen_inventory`
- warranties, receipts, appliance manuals
- routine templates and checklists — a named list of steps is not a captured
  thought. A repeating *task* is one, and 0.4 kept it on the spine: see below

"Buy more olive oil" is an item. The jar of olive oil in the pantry is not. If a
future module starts cramming inventory rows into `items` with mostly-null
columns, that is the signal the boundary was crossed.

0.3 was the first real test of this, and the boundary held: the kitchen got its
own table and `items` gained nothing. The shopping list went the other way for
the same reason — buying something is an intention, so it is an item with
`kind = 'purchase'` rather than a second to-do list the rest of TylerOS cannot
see. See ADRs 019 and 021.

0.4 tested the **other** half of the same rule. "Take the bins out every Tuesday"
_is_ a captured intention, so it stays an item — but how it repeats is four
fields no other item uses, which ADR 001 says belongs in a 1:1 extension table
rather than on `items`. So recurrence lives in `item_recurrence`, and `items`
has now gone two milestones without gaining a column. See ADR 022.

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

| Module                  | Holds                                                    |
| ----------------------- | -------------------------------------------------------- |
| `items/item.ts`         | The Item type, kinds, statuses, labels                   |
| `items/item-rules.ts`   | Lifecycle transitions, returned as patches               |
| `items/item-schema.ts`  | Validation for everything entering the system            |
| `items/item-filters.ts` | The filter vocabulary, shared by SQL, URL and predicate  |
| `capture/`              | Parsing captured text: `#tag`, `@project`, trailing date |
| `kitchen/`              | Food in the house: locations, quantities, expiry buckets |
| `recurrence/`           | How something repeats, and when it is next due           |
| `today/`                | Bucketing open items for the Today view                  |
| `agenda/`               | The days ahead, one list per domain that has dates       |
| `projects/`             | Projects and progress                                    |
| `tags/`                 | Tag name normalisation                                   |
| `shared/date.ts`        | Calendar dates. Every function takes "now" explicitly    |
| `shared/errors.ts`      | `DomainError`, thrown when an invariant is broken        |

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

### `src/lib/` — framework glue, not a layer

Three files: `cn.ts` (class merging), `search-params.ts` (reading a possibly
repeated URL parameter) and `keyboard.ts` (is the user typing, and is a modifier
held). All three are React/Next/DOM plumbing with no business meaning.

It is not a general utilities folder, and `src/domain/` is forbidden from
importing it. Anything with a domain meaning goes in `src/domain/` under a name
that says what it is. If this folder starts accumulating files, that is the
symptom of a domain concept looking for a home.

### Where the layering is written down

In three places, on purpose, each doing something the others cannot:

| Where                | Form                    | Catches                                   |
| -------------------- | ----------------------- | ----------------------------------------- |
| `eslint.config.mjs`  | `no-restricted-imports` | a violation, mechanically, at lint time   |
| `.claude/rules/*.md` | path-scoped agent rules | a coding agent about to write a violation |
| this document        | prose                   | a human deciding where something belongs  |

The lint rules are the enforcement; the other two exist to stop the violation
being written in the first place. Changing the boundaries means changing all
three, and `pnpm check:context` verifies the rules still point at real files.

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
                   |    kind, status, due_on
                   |
                   └──1:1── item_recurrence
                              frequency, interval, anchor_on, last_completed_on

kitchen_inventory        stands alone, on purpose
  name, location, quantity, unit, expires_on
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

**item_recurrence** — how a repeating item repeats, as a 1:1 extension of
`items` rather than four columns null on nearly every row. Occurrences are
**computed from `anchor_on`, never stored**: a schedule with no end cannot be a
table, and counting from the anchor rather than from the previous occurrence is
what stops a monthly repeat drifting backwards every short February. Completing
a repeating item completes the current occurrence and moves `due_on` on; there
is no path in the application that permanently finishes one. See ADR 022.

**kitchen_inventory** — the first structured domain, and deliberately unrelated
to everything above: no foreign keys, no tags, no project. `quantity` is nullable
because "some rice" is a true answer, and `unit` is free text because no enum
survives "0.5 bag". `expires_on` is a date for the same reason `due_on` is. There
is **no unique constraint on `name`**: two chicken packages with different dates
are two truthful records, and merging them would invent a fact. See ADRs 019
and 020.

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

Three tiers, split by what they need to run.

| Kind            | What it covers                                    | Needs            | In `pnpm check` |
| --------------- | ------------------------------------------------- | ---------------- | --------------- |
| Domain          | Transitions, parsing, bucketing, validation edges | Nothing          | yes             |
| Integration     | The SQL itself: full-text search, tags, cascades  | Nothing (PGlite) | yes             |
| Smoke (browser) | That the app is wired together end to end         | A real database  | no              |

Integration tests run Postgres in-process through PGlite and apply the committed
migrations from scratch, so every run also proves the migrations still work. They
have already earned their keep: they caught `ORDER BY` rendering as
`due_on nulls last asc`, and a unique-violation code arriving one level down the
error `cause` chain.

Browser smoke tests live in `e2e/` and run under Playwright against a real
database. They are **outside** `pnpm check` deliberately: a gate that needs
infrastructure is a gate that gets skipped, and the fast tests rot alongside it.
See `docs/VERIFICATION.md`.

There are still no component tests. Rendering assertions on a UI this young cost
more than they catch; the smoke suite covers whether the wiring works, and the
manual checklist covers whether it is pleasant to use.

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
