# Decisions

Lightweight ADRs. One entry per decision that would otherwise be re-litigated,
recorded so a future session can tell "deliberate" from "nobody thought about it".

Format: what was decided, what else was considered, why. Status is `accepted`
until something supersedes it.

---

## 001 · The inbox is a status, not an entity

**Accepted** · 0.1

Everything captured is an `Item`. `status = 'inbox'` means untriaged.

**Considered:** a separate `captures` table that items are "promoted" out of;
separate tables per module (`tasks`, `notes`, `media`).

**Why:** separate tables mean a separate capture path, a separate search query and
a separate UI per module — which is exactly how a personal system decays into
disconnected CRUD pages. One spine keeps capture fast and retrieval universal.

**Cost:** items carry columns not every kind uses (`due_on` on a note). Acceptable
at five kinds; if a kind ever needs three or more fields of its own, add a 1:1
extension table rather than widening `items`.

---

## 002 · Drizzle rather than Prisma

**Accepted** · 0.1

**Considered:** Prisma, Kysely, raw SQL.

**Why:** TylerOS's retrieval story is Postgres-native — `tsvector` full-text now,
`pgvector` later. Drizzle keeps SQL in reach exactly where this project needs to
lean into it, generates migrations as plain SQL that can be read and hand-edited,
and needs no client generation step or engine binary. The schema is TypeScript, so
types and DDL cannot drift.

Prisma is the better tool for a team that wants to think about SQL as little as
possible. That is the opposite of what this project wants.

---

## 003 · No authentication, no `user_id`

**Accepted** · 0.1

TylerOS is single-user and local. No auth, no session, no tenancy column anywhere.

**Considered:** carrying a nullable `user_id` "just in case".

**Why:** a tenancy column taxes every query, index and test forever, to serve a
scenario that may never arrive. Adding one to a single-user database later is one
migration with one backfill value.

**Revisit when:** TylerOS is exposed beyond localhost, or a second person needs
their own data. At that point add auth first, then the column.

---

## 004 · No REST or tRPC layer

**Accepted** · 0.1

Server Components read, Server Actions write.

**Considered:** tRPC; `app/api/*` route handlers.

**Why:** a single user does not need a network boundary inside their own app. It
would add serialisation, a second validation surface and a second error-handling
convention for no benefit.

**Not a lock-in:** services are plain functions taking `(db, input)`. An HTTP
layer later is a thin wrapper, not a refactor. That is precisely why services do
not reach for a database singleton.

---

## 005 · Due dates are calendar dates, not timestamps

**Accepted** · 0.1

`due_on date`, handled as `YYYY-MM-DD` strings end to end.

**Why:** "pay the electric bill Friday" is a day, not a moment. Storing an instant
means picking a time nobody chose, then converting it in every direction. Calendar
dates sort correctly as strings and compare without a library.

**Cost:** timed reminders will need a separate column when they arrive. That is
the right time to add one.

---

## 006 · No client state library

**Accepted** · 0.1

**Considered:** Zustand, React Query.

**Why:** the server already owns the state. `useOptimistic` and `useTransition`
cover responsiveness; URL params cover filters, which also makes every filtered
view linkable. A client cache in a server-rendered single-user app is a
synchronisation problem bought for nothing.

---

## 007 · Repositories take `db` as an argument

**Accepted** · 0.1

Every repository and service takes the database handle as its first parameter
rather than importing a singleton.

**Why:** it is what makes integration tests possible without Docker, and it lets a
transaction handle be passed straight through wherever a `Database` is expected.
One parameter, no container, no framework.

---

## 008 · PGlite for integration tests; real Postgres to run the app

**Accepted** · 0.1

Tests boot Postgres in-process via PGlite. The application always talks to a real
Postgres server through postgres.js.

**Considered:** mocking the repository layer; requiring Docker for tests; running
the app itself against PGlite.

**Why mocks lose:** the interesting bugs in this layer _are_ the SQL — a generated
`tsvector`, `ORDER BY ... NULLS LAST`, `count(*) FILTER`, cascade behaviour. A mock
asserts that the code calls the mock.

**Why not PGlite for the app too:** it was tried. PGlite over a socket
(`pglite-socket`) resets the connection on Drizzle's lateral-join relational
queries, and PGlite in-process fails to initialise inside the Next.js server
bundle. Both were removed rather than shipped as a flaky convenience. A real
Postgres is a requirement to run TylerOS, and `docker-compose.yml` provides one. See ADR 015 for the two supported ways to have one.

---

## 009 · Full-text search with a substring fallback

**Accepted** · 0.1

Search matches `websearch_to_tsquery` against a generated `tsvector`, **and**
`ILIKE` against title and body, ranked so real full-text matches come first.

**Why:** Postgres full-text search matches whole lexemes, so "sever" would never
find "Severance". Personal search is mostly half-remembered fragments. The
fallback costs one extra predicate and makes search feel like it works.

**Revisit when:** the item count makes the `ILIKE` scan noticeable. A trigram
index (`pg_trgm`) is the next step, not a rewrite.

---

## 010 · Native `<select>` instead of a custom listbox

**Accepted** · 0.1

**Why:** keyboard accessible for free, and it opens the real picker on a phone,
which no custom widget matches. Fewer dependencies, better mobile behaviour.

---

## 011 · Theme follows the operating system

**Accepted** · 0.1

Light and dark are defined as CSS variables switched by `prefers-color-scheme`.
There is no toggle.

**Why:** a toggle is client state that has to be stored, hydrated and kept in sync
to answer a question the OS already answers.

---

## 012 · Server actions return a result; they never redirect

**Accepted** · 0.1

Actions return `ActionResult<T>`, a discriminated union. None of them call
`redirect()`.

**Why:** a form needs field errors and a button needs a toast, and neither wants an
exception. And `redirect()` works by throwing, so calling it inside the shared
error wrapper would have it caught and logged as an unexpected failure. Navigation
belongs to the component that knows where the user should end up.

---

## 013 · Items are created by capture only

**Accepted** · 0.1

There is no "new item" form. Everything is captured as text, then edited.

**Considered:** a full creation form alongside the capture bar.

**Why:** one creation path means one place for the rules to live, and it keeps the
product honest about its own philosophy — if capture is not good enough to be the
only way in, capture needs fixing.

---

## 014 · Session context is CLAUDE.md plus path-scoped rules

**Accepted** · 0.1 hardening

`CLAUDE.md` holds only what almost every session needs. Layer-specific
conventions live in `.claude/rules/*.md` with `paths:` frontmatter, so they load
into context only when a matching file is opened.

**Considered:** one large `CLAUDE.md`; splitting it with `@path` imports; nested
`CLAUDE.md` files per directory.

**Why:** imports are expanded at launch, so they organise without saving any
context — the file gets longer for the same cost. Path-scoped rules genuinely
cost nothing until they are relevant, and they arrive exactly when a mistake is
about to be made. Nested `CLAUDE.md` files behave similarly but bury conventions
inside the source tree where they are easy to miss when reading the repo.

**Cost:** a glob that matches nothing silently disables its rule. `pnpm
check:context` fails the build in that case, along with dangling file references
and documented commands that no longer exist.

---

## 015 · Two supported development environments; PostgreSQL stays

**Accepted** · 0.1 hardening

TylerOS requires PostgreSQL reached by a standard connection string. Two
environments are supported and documented: a local server via
`docker-compose.yml`, or any remote PostgreSQL for a machine without Docker or
administrator rights. `pnpm check:env` diagnoses either.

**Considered and rejected:**

- **Switching database.** SQLite would run anywhere, and would cost the
  `tsvector` search this product is built around plus the `pgvector` path in ADR 002. Changing the database to suit one laptop is the wrong trade.
- **Bundling PostgreSQL as a dependency** (`embedded-postgres` and similar).
  It would make `pnpm dev` work with no infrastructure, at the price of a
  heavyweight dependency shipping third-party binaries, and a third "how do I
  get a database" path to keep working. A remote connection string already
  solves it with nothing installed.
- **PGlite for the application.** Tried during 0.1 and it does not work: see
  ADR 008.

**Why it stays clean:** no hosting provider is named anywhere in the code.
`sslmode` is a standard PostgreSQL URL parameter handled by the driver, so
remote databases need no application changes.

---

## 016 · Browser smoke tests, deliberately outside the gate

**Accepted** · 0.1 hardening

The Playwright specs in `e2e/` cover the flows whose breakage makes TylerOS
unusable. `pnpm test:e2e` runs them; `pnpm check` does not.

**Considered:** adding them to `pnpm check`; a full end-to-end suite; skipping
them automatically when no database is configured.

**Why outside the gate:** `pnpm check` must run with no database and no network.
A gate that needs infrastructure gets skipped, and the fast tests rot with it.

**Why not auto-skip:** a suite that silently passes when it did not run is worse
than one that fails loudly. `e2e/global-setup.ts` refuses to start and prints the
command to fix it.

**Why so few:** they exist to prove the wiring, not to re-test domain rules that
already have fast unit tests. A spec that passes whenever the others pass is not
earning its place. Whether the app is _pleasant_ is a human
judgement — hence the manual checklist in `docs/VERIFICATION.md`.

---

## 017 · Capture is parsed by one pure function, given today and the projects

**Accepted** · 0.2

`parseCapture(text, { today, projects })` in `src/domain/capture/` turns raw
captured text into a title, a due date, a project id and tags. It is the only
place capture is interpreted. Both the server action and the capture bar's live
preview call it, which is why the preview cannot promise something the server
will not do.

**Considered:** three independent regexes at the three call sites; resolving
`@project` in the service and leaving the domain to return a bare string; a
parser registry that later AI proposers could register into.

**Why one function:** the tokens interact. Removing `#tag` and `@project` before
looking for a date is what makes `pay bill friday #finance` and
`pay bill #finance friday` the same capture. Three separate passes at three call
sites would drift apart the first time one of them was changed.

**Why it takes the projects:** resolving `@kitchen` needs to know what projects
exist, and an unresolved reference must stay in the title rather than vanish.
Deciding that inside the parser keeps the "did it resolve" branch in one place —
and passing the candidates in as an argument keeps the domain pure, exactly as
`today` is passed rather than read from the clock.

**Why no registry:** there is one parser. An abstraction for hypothetical future
proposers is the thing this codebase's rules explicitly forbid. If an AI proposer
ever arrives it will live in the server layer and produce the same
`ParsedCapture` shape, so the seam will already be right without anyone having
designed for it.

---

## 018 · A date is only read from the end of a capture

**Accepted** · 0.2

`matchTrailingDatePhrase` looks for a date phrase only at the end of the text
that remains once tags and the project reference have been removed.

**Considered:** scanning the whole string for anything date-shaped.

**Why:** "monday meeting notes" is a note about a meeting, not something due on
Monday. Scanning everywhere would rewrite that title to "meeting notes" and
attach a date the user never asked for. Capture is the one place in TylerOS
where being wrong is expensive, because nobody re-reads an item that already
looks correctly filed.

**The cost:** "pay the bill friday morning" gets no date, because "friday" is not
last. That is the right trade — a missing date is visible and fixable in one
keystroke, a wrong one is silent.

**Also deliberate:** stripping the phrase never empties the title. A capture of
just "tomorrow" stays an item called "tomorrow" with no due date, rather than a
dated item with no name.

---

## 019 · Kitchen inventory is a table of its own

**Accepted** · 0.3

Food in the house lives in `kitchen_inventory`, not in `items`. Locations are a
`kitchen_location` enum: fridge, freezer, pantry.

**Considered:** an item `kind = 'food'` with nullable quantity, unit, location
and expiry columns; a generic `locations` table; a general home-inventory model
covering the garage and the medicine cabinet.

**Why not items:** this is the boundary ADR 001 predicted, and this is the
milestone that tested it. "Buy more olive oil" is something to act on; the jar in
the pantry is a fact about the world. Putting the jar on the item spine would
mean four columns no other kind uses, an inbox that fills with groceries, and a
Today view that has to learn to ignore them. The boundary held: nothing in
`items` changed for this milestone.

**Why an enum, not a table:** three locations, no attributes of their own, and
`ALTER TYPE ... ADD VALUE` makes a fourth one a one-line, non-destructive
migration. A locations table would buy a join on every query to serve a garage
nobody has asked for. It also matches how `item_kind` and `item_status` are
already done, which matters more than either option's merits.

**Cost:** kitchen records are outside full-text search and have their own
retrieval path. That is the honest cost of a second domain, and it is paid once
in `searchInventory` rather than everywhere.

---

## 020 · Quantity is an optional number and a free-text unit

**Accepted** · 0.3

`quantity numeric(10,2)` nullable, `unit text` nullable. Null quantity means
"some, uncounted"; null unit means a bare count. Nothing is ever converted.

**Considered:** a units enum; separate count and measure columns; a unit table
with conversion factors; storing quantity as text.

**Why:** a kitchen holds "2 lb", "8", "0.5 bag" and "some rice", and all four are
true answers. A units enum cannot hold "bottle" and "loaf" without a migration
per grocery aisle, so it would be worked around within a week. Free text with a
suggested list keeps the common cases tidy and the unusual ones possible.

**Why no conversions:** converting 2 lb to grams requires knowing that a "bag"
is not a mass, and the moment the system converts anything it has to be right
about everything. Displaying what the user typed is always correct.

**Cost:** "lb" and "lbs" are different units, and no total can be computed across
them. Acceptable for a fridge; the wrong trade for a warehouse. **Revisit when:**
meal planning needs to subtract a recipe's ingredients from stock — that is the
first feature that genuinely needs comparable quantities, and it should bring its
own conversion table rather than retrofitting one here.

---

## 021 · The shopping list is items, not kitchen records

**Accepted** · 0.3

A shopping line is an `Item` with `kind = 'purchase'`. Purchased is the ordinary
`done` status. There is no shopping table.

**Considered:** a `kitchen_shopping` table alongside the inventory, with its own
quantity and unit columns and its own purchased flag.

**Why:** `docs/ARCHITECTURE.md` had already decided it in as many words — "buy
more olive oil" is an item. The `purchase` kind existed and was unused. Putting
the list on the spine means capture, `#tags`, `@project`, search, Today and the
completion toggle all work on it with no second implementation, and "buy milk"
typed into the capture bar is the same object as a line added from the kitchen.
A parallel table would have been a second to-do list that the rest of TylerOS
could not see — exactly the disconnected-CRUD failure the architecture is built
against.

**Where the quantity went:** into the text. "2 gal milk" is how a shopping list
is written by hand, and it is the only place in this design where a field was
dropped rather than modelled. A structured desired-quantity would have earned a
1:1 extension table under ADR 001's rule; it did not earn one for two fields
nobody reads except at the shop.

**The one seam:** using up the last of something deletes the kitchen record and
creates a purchase item. That crossing lives in the kitchen service, which is
allowed to orchestrate both, and nowhere else.
