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

---

## 022 · One recurring item that moves, not a table of occurrences

**Accepted** · 0.4

A repeating responsibility is **one `Item`**. Completing it completes the current
occurrence and moves the item's `due_on` to the next one. The rule lives in
`item_recurrence`, a 1:1 extension of `items` keyed by `item_id`, holding a
frequency, an interval, an anchor date and the date it was last done.

**Considered:** columns on `items` directly; a separate `recurring_task` entity
that spawns ordinary items; generating occurrence rows ahead of time; a full
RFC 5545 `RRULE` string.

**Why one item:** the alternative every scheduler reaches for — generate the
occurrences — has no answer to "how many". A weekly repeat has no end, so it is
either an unbounded table or a background job topping it up, and this
application has neither cron nor workers by design. Computing the next date from
a rule is a pure function with no infrastructure behind it at all.

**Why not columns on `items`:** ADR 001 already wrote this rule down — three or
more fields of its own means a 1:1 extension table. Four columns null on almost
every row is exactly the mostly-null signal `docs/ARCHITECTURE.md` says to watch
for, and `items` has now gone through kitchen inventory and recurrence without
gaining a single column.

**Why not RRULE:** it would be a parser, a serialiser and a whole vocabulary of
things TylerOS has no way to display, to serve "the third weekday of the month
unless it is a holiday". The frequency-plus-interval model expresses every
example the milestone was actually about, and its limits are visible rather than
theoretical.

**The anchor is the interesting part.** Occurrences are counted from `anchor_on`
rather than from the previous occurrence, so a monthly repeat clamped by a short
February gives January 31st → February 28th → **March 31st**. Stepping one
period at a time would give March 28th, and the schedule would quietly walk
backwards a few days a year. The anchor moves only when the due date is
deliberately changed, which is why saving the editor without touching the date
cannot re-anchor it.

**Completing is the only way to finish an occurrence, and there is no way to
finish the responsibility by accident.** Every route to `done` — the row's
circle, `x` in keyboard triage, bulk triage, an explicit status change — settles
the occurrence instead. The editor does not offer `done` at all while an item
repeats, and the schema refuses the combination. Ending a repeat is removing the
repeat, or archiving.

**Late and missed occurrences.** The next date is the next one **on the
schedule**, counted after whichever is later of the due date and the day it was
actually done. Bins missed on Tuesday and taken out on Thursday are due again on
Tuesday, not Thursday. Three missed weeks are one late completion rather than
three catch-ups: nothing accumulates, because nothing was ever generated. An
overdue repeat keeps its real due date and shows as overdue for as long as it
has been — TylerOS reports that the bins were missed rather than pretending they
were not.

**Cost:** there is no history of completions, only `last_completed_on`. "When did
I last change the filter" is answerable; "how often do I actually do this" is
not. **Revisit when:** something genuinely reads a series of past completions —
that feature brings its own occurrence log, and it should be a log of what
happened rather than a table of what was supposed to.

---

## 023 · Days hold one list per domain; there is no events table

**Accepted** · 0.4

`src/domain/agenda/` projects a window of days. Each day holds separate,
separately-typed lists: items due, repeats projected from a rule, and food
expiring. `/upcoming` renders them. No table, no shared base type, no `source`
column.

**Considered:** an `events` table every domain writes into; a `Timed` interface
each domain implements; giving kitchen inventory a `due_on` and putting it on
the item spine.

**Why not a shared table:** it would make the fridge a to-do list. A best-by date
and a bin day are both facts about a day and nothing else about them is alike —
one is something to do, one is something that will happen whether or not anyone
acts. ADR 019 kept that separation out of the schema; a projection that merges
them would put it straight back in, one write path at a time.

**Why not an interface:** two implementations is not enough to earn an
abstraction, and this codebase says so in as many words. A named list per domain
is readable, keeps each type intact, and makes a fourth time-bearing domain a
four-line change here and nothing anywhere else.

**Why projected occurrences are not rows:** the fortnight ahead shows every bin
day, computed from the rule as the page renders. That is the payoff of ADR 022 —
a view of the future that costs nothing to keep true. They are drawn as text
rather than as item rows and cannot be completed, because completing a Tuesday
that has not arrived would complete the wrong occurrence.

**Revisit when:** a fourth domain gains dates, or something needs to interleave
them in one ordered stream rather than group them. Either would be the point to
generalise, with three real implementations to generalise from.

---

## 024 · The editor owns its draft; the server's values are adopted, not imposed

**Accepted** · 0.4.1

`ItemForm` intercepts its own submit — `event.preventDefault()` and then
dispatching inside a transition — rather than letting React drive the submission
through the `action` prop. It keeps three things apart: the persisted snapshot,
the local draft (`ItemFields`, which is remounted to re-seed it), and whether the
draft has moved since the last save began. A clean draft adopts the server's
values; a dirty one wins.

**The problem, precisely:** React 19 resets a form submitted through its `action`
prop as soon as the action resolves. `startHostTransition` schedules
`requestFormReset`, and at commit `recursivelyResetForms` calls a raw DOM
`form.reset()`. Against a remote database that lands a second or more after the
click — long enough to have started the next edit, which was silently thrown
away.

It was worse than lost keystrokes. `reset()` knows nothing about React, so the
controlled repeat `<select>` snapped back to "Does not repeat" while state still
said weekly and the sentence beneath it still read "Every 2 weeks". Saving from
there would have deleted the schedule the screen was promising to keep. And
because the reset is scheduled on submit rather than on success, a _rejected_
save wiped edits too.

**Considered:**

- **Controlling every field.** React's own documentation points here, and it is
  wrong for this form twice over: `reset()` still mutates the DOM and React only
  re-asserts a controlled value when its prop changes, which is exactly how the
  `<select>` desynced. It would also give up the pre-hydration typing that 0.2
  paid for — see that milestone's recorded result.
- **Narrowing `revalidatePath("/", "layout")`.** It was not the cause. The reset
  fires whether or not anything revalidates, so this would have changed nothing
  while giving up the coarse revalidation that removed a class of stale-badge
  bugs.
- **Re-seeding whenever the `item` prop changes.** That is the trap, not the fix:
  every revalidation anywhere in the app hands this component a new object, so it
  would destroy a dirty draft on somebody else's save. Hence comparing the
  editable fields by value rather than by identity.
- **Debouncing or delaying the adoption.** A timer would have hidden the race
  rather than removed it, and races hidden by timers come back on a slower
  network.

**Why remounting to re-seed:** uncontrolled fields read their value from
`defaultValue`, so the only honest way to discard a draft is to build the fields
again. Making that a remount of one component means there is exactly one place
that decides a draft may be thrown away, instead of seven fields each having to
remember how to reset themselves.

**Cost:** the editor no longer submits through the `action` prop when JavaScript
is running, so React's pending-state bookkeeping for that form is ours to keep.
The prop stays on the form, so a submit before hydration is still a plain
server-action POST.

**Revisit when:** a second form in this codebase needs the same treatment. Two
would be enough to earn a shared hook; one is not.

---

## 025 · A repeat is read from the end of a capture, before the date

**Accepted** · 0.4.1

`matchTrailingRecurrencePhrase` in `src/domain/capture/` reads a small, closed
grammar — daily/weekly/monthly, every N of them, every other one, every
`<weekday>`, and fortnightly — from the **end** of what is left after tags and
`@project` are removed. It runs **before** the date matcher.

**Why before:** a repeat can end in a date-shaped word. Read the other way round,
"take trash out every tuesday" loses its Tuesday to `matchTrailingDatePhrase` and
becomes an item called "take trash out every". The tests caught this; the order is
not arbitrary and should not be flipped back.

A date and a repeat still arrive in either order, so there is one extra pass: if
the first look found no repeat and the date pass consumed something, the repeat is
looked for again. Deliberately **not a loop** — repeatedly stripping dates would
change what "meeting friday tomorrow" has always meant.

**Considered:** an RRULE subset; a general natural-language date/recurrence
library; scanning the whole string rather than the tail; a parser registry that a
future AI proposer could register into.

**Why so small:** the grammar covers what the milestone was actually about — bins,
rent, sheets, air filters — and nothing else. Everything outside it stays in the
title untouched: "every full moon", "twice a week", "last friday of the month",
"every 0 weeks" and an interval above what the domain accepts. An out-of-range
interval is **refused, not clamped**; clamping "every 500 days" to 99 would invent
a schedule nobody asked for.

"biweekly" is excluded on purpose. It means both twice a week and every two weeks
depending on who is saying it, and a schedule nobody can predict is worse than one
word of title.

**Why no registry:** ADR 017 already answered this. There is one parser, and an AI
proposer would produce the same `ParsedCapture` shape from the server layer.

**Where the anchor comes from:** `startingOccurrence`, the same rule the editor
applies — a stated date wins, then the day a phrase like "every tuesday" named,
then today. Persistence goes through the same `writeRecurrence` as the editor, so a
captured repeat and a hand-built one are the same row with the same anchor. That is
what makes completion, skipping, Upcoming and the badges work with no new code.

**Cost:** a title that genuinely ends in a schedule word — "cancel my daily" —
loses it. That is ADR 018's trade-off applied to repeats, and the preview is the
mitigation: it spells the schedule out as "Every Tuesday" before Enter, where a
bare "Weekly" would leave the reader unsure which day it landed on.
