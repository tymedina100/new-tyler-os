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

---

## 026 · One AI call, behind a function type, with no SDK

**Accepted** · 0.5

TylerOS's entire AI surface is one non-streaming `POST /v1/messages` in
`src/server/ai/anthropic-messages.ts`, reached through a `Classifier` function
type. It classifies one captured line against a closed vocabulary. There is no
second turn, no tool use, no memory, no retrieval and no agent.

**No provider SDK.** `@anthropic-ai/sdk` was considered and rejected on three
grounds. The request is a small JSON body that `fetch` sends natively on Node 22,
so nothing in `package.json` was missing. The SDK's headline feature here —
automatic retries — is actively wrong for an optional suggestion, which should
stop quietly rather than re-bill on its own initiative. And a `dependencies` entry
is bundled into every server build, for a feature that ships switched off.

The cost is real and accepted: auth headers and the error taxonomy are ours. Both
are about fifteen lines, and the taxonomy had to be written anyway, because the
failure categories are what the log prints.

**No abstraction for a second provider.** `Classifier` is a _function type passed
as an argument_, exactly as `db: Database` is — not an interface, an adapter, a
strategy or a registry. One implementation calls Anthropic; tests pass a lambda.
If a second provider ever arrives it will be a second function, and the seam is
already there. ADR 025 rejected a parser registry for the same reason.

**Considered and rejected:** the SDK; `output_config.format` structured outputs
(the wire shape could not be verified against a live API from the machine this was
built on, and a robust parse of a shape that _could_ be verified beats guessing —
malformed output is a required-handled case regardless); a tool definition used
purely as an output schema (tool use is out of scope for this milestone by
instruction, and using one as a JSON schema is that in all but name); mocking the
provider by module interception in tests.

**The key.** It is read in `ai-config.ts`, passed to one function, put in one
header, and never stored, returned, logged or attached to an error. Every failure
value is a fixed member of a closed union, so no provider text can reach a log.

`server-only` would have made a UI import of that file a build error, and was
tried. Next resolves it internally but Vitest does not, so it is a dependency that
only looks free — it broke `pnpm test` immediately. The enforcement is instead a
lint rule forbidding `@/server/ai/*` from `src/components/**` and `src/app/**`,
which is how every other boundary in this repository is enforced, costs nothing,
runs in the gate, and was verified to fire before being kept.

**Model.** `claude-opus-5` by default, overridable with `AI_MODEL`. This fires once
per capture, so the cost/quality trade-off is the owner's; the default is not
downgraded on their behalf.

---

## 027 · Suggestions are rows the user resolves, one proposed value at a time

**Accepted** · 0.5

`item_suggestions` holds **one row per proposed value**, not one row per model
response. `items` gained no column, and nothing that queries `items` can read a
model's guess as a fact.

**Why one row per value:** partial acceptance. The user must be able to take
"project: Home" and ignore "tag: maintenance", so each proposal has to resolve on
its own. A single row with a per-field status would have meant tracking three
statuses inside one row — a JSON blob pretending to be a schema.

**Why not a whole-response staleness signature.** That was the first design and it
is wrong in a way that is easy to miss: accepting a proposal _mutates the item_, so
a signature over the item would stale every sibling the instant the first one was
accepted, and partial acceptance would be nominal rather than real. Instead each
row stores `observed_value` — what its own field held when it was proposed — plus
`observed_title`, shared, because a retitled item is a different capture and
everything about the old words goes with it.

Accepting then has three outcomes, decided by the pure `reconcileSuggestion`:
`applicable`, `redundant` (the item already says this), and `superseded` (the item
moved on — retire the proposal, **change nothing**). The last is the one that
matters: a newer manual choice always survives an older automated one, and the
toast says so rather than claiming a save that did not happen.

**Duplicate safety is in SQL.** Two partial unique indexes, plus `on conflict do
nothing`. The first attempt was a single index over `coalesce(kind::text,
project_id::text, tag_name)` and Postgres refuses it — casting an enum to text is
only STABLE, not IMMUTABLE. The integration harness caught that before it reached
any database, which is the argument for applying migrations from scratch on every
test run. Splitting on `field` states the real rule better anyway: an item has one
kind and one project, while tags are a set.

Above that sits a service guard: **one pass per item, ever**. It is the retry guard
and the answer to persistent nagging at once — a dismissed proposal never returns.

**What is deliberately not stored:** the prompt, the raw response, token counts,
cost, or a request log. None is needed to render a suggestion or to decide whether
it still applies, and retaining the text of personal captures beside a provider's
reply is a privacy cost with no user-visible return. What survives a run is the
grounded proposal and the model identifier.

**Considered:** a general `ai_events` table (a universal log for one feature);
storing tag _ids_ rather than names (a proposal must not create a tag before
anybody accepts it); `on delete set null` for the suggested project, matching
`items` (an item outlives its project; a proposal into a deleted project does not).

**Applying goes through the ordinary item service.** `setItemKind`,
`setItemProject` and `addItemTag` — the same functions the row menu and the editor
call. There is no second way for an item to change, so no rule an AI path could
skip. `addItemTag` deliberately does not triage: a kind says what something is and
a project says where it lives, but a tag answers neither, and ejecting an
untriaged item from the inbox over one label would take it off the triage screen
before its kind was decided.

---

## 028 · Search composes the domains; it does not merge them

**Accepted** · 0.6

A query reaches items, projects and kitchen inventory at once. Each domain owns
its own matching in its own repository; `src/server/search/search-service.ts`
runs the three concurrently and hands the rows to a pure projection in
`src/domain/search/`, which ranks them and groups them by where they came from.
The UI receives `SearchHit` — domain, id, title, context, href, tier — and
nothing else.

**Considered:** a universal `entities` table every domain writes into; a single
SQL `UNION` across the three tables; a `Searchable` interface each domain
implements; a search registry domains subscribe to; giving kitchen inventory a
`search_vector` and folding it onto the item spine.

**Why not a shared table or the item spine:** it would make the fridge a to-do
list. This is ADR 023's argument again, and it holds for the same reason — a
packet of chicken and "make chicken before the game" are both findable by the
same word and nothing else about them is alike. ADR 019 kept that separation out
of the schema; a retrieval layer that merged them would put it back one write
path at a time.

**Why not a `UNION`:** the domains do not match alike and should not. Items have
a generated `tsvector` because notes are prose (ADR 009); the kitchen matches
substrings because "chick" has to find "Chicken breast" and full-text search
matches whole lexemes (ADR 019); projects now do the same, for the same reason.
A `UNION` would force one of those shapes onto all three, and every future
domain would have to be bent to fit it before it could be searched at all.

**Why not an interface or a registry:** three implementations is barely enough to
generalise from, and a `Searchable` contract would have to be satisfied by every
domain _before_ it could join — the same inversion a plugin system makes. A
mapping function per domain in `search-sources.ts` inverts it back: search
depends on the domains, the domains depend on nothing. A projection depends on
what it projects.

**How a fourth domain joins:** a query in its own repository, a `…Hit` function
in `search-sources.ts`, and one entry in `SEARCH_DOMAINS`. It touches no other
domain's internals and no other domain's code.

**Ranking is four tiers, not a score.** Exact name, prefix, word inside, then
anything the domain matched elsewhere. Ties break on title and then on id — the
last is never what anyone wants to sort by, and is exactly why the ordering is
safe to assert: there is no unique constraint on an inventory name (ADR 019), so
two rows really can read "Chicken breast" and still need one correct order.
Ranking happens **inside** a group, never across one: `ts_rank` on an item and a
substring hit in a food name are not the same quantity, and grouping is what
makes comparing them unnecessary rather than merely unwise. Groups lead with
their best tier, so "chicken" opens with the freezer and "monitor" with the
items.

**No migration, and that is the finding.** Everything needed was already there:
the items `tsvector` and its GIN index from 0.1, and two tables small enough that
a sequential `ILIKE` scan is not measurable. A generated column for a few dozen
projects would be maintenance with no reader. Measured on the development
database: **three SQL statements per search regardless of result count** — 27
results and 3 results both cost three — at roughly 90ms against a remote
Postgres, most of which is the network.

**Cost:** result caps are per domain and there is no pagination, so a query
matching more than fifty items shows fifty. That is deliberate at personal scale:
needing the fifty-first means the query was too vague, and the fix is a better
query rather than infinite scroll.

**Revisit when:** a fourth or fifth domain makes the mapping functions tedious, or
`ILIKE` becomes measurable — `pg_trgm` is the next step there, not a rewrite.

---

## 029 · Deterministic search first; semantic retrieval is deferred

**Accepted** · 0.6

0.6 ships full-text and substring search and **no** `pgvector`, no embeddings, no
model in the retrieval path. The roadmap had listed semantic search under 0.5.

**Why:** we do not yet know what ordinary search cannot do. Until 0.6, retrieval
reached one table out of three, so every failure to find something had a
mundane explanation — it was in the fridge, or it was a project — and no amount
of semantic similarity would have fixed a query that never ran. Adding
embeddings on top of that would have bought a plausible-looking answer to a
question nobody had established.

There is also a cost that only counts once. Embeddings mean an API key on the
read path, a vector column to backfill and keep current, and a second thing that
can be stale. Every one of those is a permanent tax on a system whose stated
rule is that it must work with AI switched off. Search is the flow most likely
to be used dozens of times a day; making it the first thing to _need_ a provider
would invert the constraint the whole architecture is built on.

**What would justify revisiting:** real, repeated searches that fail because the
words stored and the words remembered genuinely differ — "that thing about
the leaky tap" against an item titled "call the plumber". That is a real limit
of lexical matching and the one semantic retrieval actually solves. Recording a
few of those is the evidence to gather; until then this is a guess.

**When it comes, it is additive.** A `vector` column beside `search_vector`, a
fourth strategy inside the same `searchEverything` composition, and the same
`SearchHit` out the other end. Owning the SQL is what keeps that a migration
rather than a rewrite — which is the whole reason ADR 002 chose Drizzle.

**Not deferred, refused:** search history, saved searches, search analytics, and
LLM query rewriting. The first three are data about personal behaviour nobody
would act on, and the fourth puts a model between the user and their own words.

---

## 030 · One authorized identity, a signed cookie, no accounts

**Accepted** · 0.7

TylerOS becomes reachable outside localhost in 0.7, which is the exact
condition ADR 003 named for revisiting "no authentication." This ADR is that
revisit. It keeps the other half of ADR 003 unchanged: there is still no
`user_id` anywhere, because there is still exactly one person.

**Threat model.** TylerOS protects one thing — everything captured, tracked or
decided by one person — from one class of adversary: anyone who is not that
person, reaching a URL. It does not protect against a compromised device, a
shared unlocked phone, or a subpoena; those are out of scope for a single-user
personal application the same way they are for a password manager's own local
vault. "Authenticated" here means "holds the one passphrase," not "is a
specific identity" — there is no identity to be, so the session payload
carries no subject at all, only an expiry and a nonce.

**Mechanism: a passphrase, and an HMAC-signed cookie, in `node:crypto`.** No
new dependency. `src/proxy.ts` runs on the Node.js runtime by default in
Next 16 (middleware's replacement, and middleware itself gained Node.js
support in 15.5), so `createHmac`/`timingSafeEqual` are available at the exact
boundary that needs them. This is the same reasoning ADR 026 used for the one
Anthropic call: a request this small does not need a library to make it safer,
and a dependency bundled into every build for one feature is a cost paid
whether or not the feature is used.

**Considered and rejected:**

- **Auth.js / NextAuth**, or any provider-based library. It brings accounts,
  providers, adapters and role concepts this application has explicitly
  decided against (`docs/ROADMAP.md`, "things that would be mistakes"), to
  authenticate a person who is not signing up for anything.
- **iron-session** (or any session library built on `jose`). It encrypts a
  payload; the payload here holds no secret worth encrypting, only an expiry
  and a nonce, so encryption buys nothing a plain HMAC signature does not
  already buy, at the cost of two dependencies.
- **HTTP Basic auth.** The browser re-sends the credential with every single
  request rather than once, and offers no clean way to sign out — actively
  hostile to a home-screen app someone opens dozens of times a day (0.7's own
  reason for existing).
- **Passkeys / WebAuthn.** The right answer for a multi-device, no-password
  future, and a real credential store and recovery story to build first. Noted
  as a future opportunity, not a corner cut here.

**Two independent checks, not one.** `src/proxy.ts` is Next's own recommended
_optimistic_ check — it reads the cookie and nothing else, runs on every
request including prefetches, and redirects to `/login` before a protected
page ever renders. Next's own authentication guide is explicit that this is
not sufficient alone: "a page-level authentication check does not extend to
the Server Actions defined within it." So `runAction` in
`src/server/action-result.ts` — the one funnel all 24 server actions already
passed through — now verifies the session itself, first, before its body runs.
Every existing action gained this by construction, with no action file
touched. The one action that must run with no session yet, signing in, does
not call `runAction`; see `src/server/actions/auth-actions.ts`.

**A route added later is covered without anyone remembering to.**
`src/proxy.test.ts` discovers every real `page.tsx` and `route.ts` under
`src/app/` from disk and asserts two things for each: the proxy's own matcher
actually reaches it, and it is not on the public allowlist unless a human
wrote a reason for it in `src/server/auth/public-routes.ts`. No `route.ts`
exists yet — ADR 004 still holds — but if one arrives, this is what stops it
becoming a public endpoint by omission rather than by decision.

**Session behaviour.** A 30-day rolling cookie: `HttpOnly`, `SameSite=Lax`,
`Secure` outside development, refreshed on every valid request. Thirty days
and rolling, not short-lived, because the realistic failure mode for a
personal app is being logged out at an inconvenient moment, not a stolen
session — the device's own lock screen is the actual boundary a stolen phone
crosses first.

**Secret strength is enforced, not merely documented.** Production
configuration rejects a `SESSION_SECRET` under 32 characters, an
`AUTH_PASSPHRASE` under 16, either with fewer than 8 distinct characters (so
`aaaa…` and `abababab…` cannot pass on length alone), and a small denylist of
placeholder values — including the ones this repository's own `.env.example`
would tempt someone to leave in place. See
`src/server/auth/auth-config.ts`, in `describeAuthConfig`.

**No process-local login-attempt rate limiting.** A counter in memory is not a
real boundary once more than one server instance can be running, which any
serverless target implies, and shipping one anyway would be exactly the
security theater this milestone was asked to avoid. If TylerOS is deployed
somewhere public, rate limiting belongs at the platform (Vercel's own abuse
protection, or a WAF rule) — recorded as a deployment-time hardening note in
`README.md`, not faked in application code.

**Development behaviour.** With `NODE_ENV=development` and neither secret set,
TylerOS is open, and says so once on the server console. Setting a passphrase
locally makes development behave exactly like production. Outside development,
an absent or weak secret is a hard failure — but where it fails is chosen
deliberately: `next build` must still succeed with no secrets configured,
because a production build is frequently made on a machine that does not hold
production secrets (a CI runner, a deploy preview). This was verified
empirically, not assumed: an instrumented build with `AUTH_PASSPHRASE` and
`SESSION_SECRET` both absent produced zero output from `register()` in
`src/instrumentation.ts`, proving `register()` does not run during `next
build` in this Next 16.3.2 setup, only at the boot of a real server instance —
see `docs/VERIFICATION.md`. The hard failure is therefore a per-request `503`
from `src/proxy.ts`, which a build never reaches; `instrumentation.ts` only
adds a loud, one-time log line when the real server actually starts, so the
problem is visible immediately rather than discovered from the first `503`.

**`/login` is a second root layout, not a branch inside the first.**
`src/app/(app)/layout.tsx` queries the database for sidebar counts and project
names, and renders the capture bar, the navigation and the command palette —
none of which an unauthenticated visitor should see, or which should depend on
a session to render at all. Next's own convention for exactly this — a route
needing a different `<html>`/`<body>` than the rest of the app — is multiple
root layouts through route groups, which is what `src/app/(app)/` and
`src/app/(auth)/` are. The one documented cost is a full page reload crossing
between the two groups, which is not a cost at all here: signing in and out
are already full navigations.

**Recovery.** There is no account recovery flow, by design — there is no
account. Losing the passphrase means editing `AUTH_PASSPHRASE` in the
environment and restarting the server, the same as forgetting any other
environment-configured credential this application already has. This is
appropriate for a one-person application and would not be for anything with a
second user who could be locked out by a change they did not make.

---

## 031 · Installable, not offline

**Accepted** · 0.7

TylerOS gains a web app manifest and icons in 0.7, and explicitly no service
worker. "No fake offline mode" is the stated preference over an unreliable one,
and TylerOS mutates through Server Actions on every screen — a cache in front
of that is a way to show stale personal data or silently drop a capture, not a
feature.

**Icons are generated code, not files kept in sync by hand.** `src/app/icon.tsx`
and `src/app/apple-icon.tsx` use `next/og`'s `ImageResponse` — already part of
`next`, so no new dependency — to render a single "T" mark once at build time.
The alternative considered was a hand-rolled PNG-writing script committing
binary assets under a `public` directory; that is a second source of truth for an image
that has to match the app's own accent colour, and a script whose only job is
encoding PNG bytes correctly is real risk for no real benefit here. The mark's
colour is the same `--primary` token `src/app/globals.css` already defines,
converted once to sRGB by hand, so there's exactly one place a rebrand would
touch even though the icon route can't read the stylesheet at render time.

**One icon, purpose `"any"`, not a maskable-optimised set.** A single square
icon in the manifest is enough to satisfy Chrome's installability criteria.
Building a maskable variant with the correct safe-zone padding is a real,
separate piece of work with no evidence yet that the plain icon looks wrong on
anyone's home screen — deferred, not skipped.

**`start_url: "/"` even though every route needs a session.** Opening an
installed icon and landing on `/login` — because `src/proxy.ts` treats an
installed app's launch exactly like any other visit — is the correct behaviour
for a single-user app with no "signed-out home page" concept to design.

**No service worker, and Next's own offline primitives are noted, not used.**
Next 16 ships an experimental `useOffline` hook for connectivity-aware UI and
retrying failed Server Action requests; it does not solve reliable _offline
mutation_, which still needs a queue and a conflict rule TylerOS does not have.
Reaching for it now would be the same mistake ADR 029 refused for search:
solving a problem before evidence exists that it is one.

**The Next.js dev route indicator moved out of the way, permanently, for a
real reason beyond testing.** Its default position overlaps the bottom
navigation bar's leftmost tab at the exact widths this milestone targets, on
every developer's own phone-width `pnpm dev` session, not only in the browser
suite. It is also answering a question — static or dynamic? — that this
application settled for every route in `docs/ARCHITECTURE.md` before 0.1
shipped. `devIndicators: false` in `next.config.ts`; compile and runtime errors
still surface regardless.

---

## 032 · Four daily destinations on a phone, and a More sheet for the rest

**Accepted** · 0.7

The bottom tab bar carried all seven top-level destinations since 0.1. 0.6
added Search as an eighth with nowhere to go, and shipped it into the sidebar
only — `src/components/shell/nav.tsx` already carried a comment admitting
seven tabs at 375px only fit because each one is narrower than its own label.
0.7 is what that comment was waiting for.

**Four in the bar, not eight, not three.** Today, Inbox, capture, and Search —
the instruction's own stated priorities — plus a fifth slot that opens
everything else. Capture takes a slot rather than living only inside the
capture bar, because reaching it from anywhere without scrolling to the header
was 0.7's most concrete mobile-capture ask. It is a button, not a link: there
is already exactly one capture box on every screen (project pages render a
second, scoped one), and a phone-nav "capture" action should focus that box,
not open a competing one that could drift from the deterministic parser
behind it.

**A sheet, not a hamburger menu, not a second row of tabs.** A hamburger menu
hides the fact that anything is behind it; a bottom sheet triggered by a
visible, labelled "More" tab does not. A second row of smaller tabs was
rejected for the reason the first seven already failed at: there still isn't
room, and a row of unlabelled icons trades one illegible bar for two. The
sheet is built on `@radix-ui/react-dialog` directly — already a dependency of
`cmdk`, and now used the way the codebase's other overlay (the command
palette) already establishes the pattern for: an `animate-overlay` backdrop
and one new keyframe, `tyleros-slide-up`, beside the existing fade and scale
ones in `src/app/globals.css`.

**The desktop sidebar is unchanged.** All seven destinations, still always
visible, because a sidebar has the width a bottom bar does not; the only
addition is a sign-out row, since 0.7 introduced something to sign out of. The
command palette gained the two destinations it had never carried — Kitchen and
the shopping list — so every destination is reachable from a keyboard exactly
as it is from a tap, and neither surface has to be treated as the complete
list.

---

## 033 · Notes are a standalone domain, not an item kind

**Accepted** · 0.8

A `Note` is a new, persisted entity — its own `notes` table, own repository,
service, actions and pages — not `kind = 'note'` on `items`, and not a longer
`items.body`.

**The distinction, precisely.** An item's `body` is supporting context for
something actionable: "part number is X, check the glovebox manual" beside
"replace the cabin air filter," and it dies with that item's own lifecycle. A
`Note`'s primary identity is the information itself: "Mazda6 maintenance &
parts." It has no `status` and no `due_on` — it cannot be Done, Someday,
Archived, or overdue, and nothing in this milestone gave it a path to become
any of those. Item kind `note` (a quick captured thought that is still a
task-shaped item) is untouched and unreinterpreted; it coexists with the new
domain exactly as `purchase` items already coexist with `kitchen_inventory`
(ADR 021) — two things that can both be true about "food" or "a note" without
one having to become the other.

**Considered:** an item kind `note` with a longer `body` and no lifecycle
fields required; a `notebook` JSON blob on `items`. Both were rejected for the
reason ADR 001 and ADR 019 already gave the kitchen: a structured concept that
does not share `items`' actual shape does not belong on `items`, and
`items.body`'s 10 000-character cap and its role as "notes about a task" is
already a meaning worth keeping separate from "the note itself, unbounded."
Giving `items` a `pinned` flag and a nullable `project_id` it uses for nothing
else on a task would be exactly the mostly-null-columns smell both ADRs warn
against.

**Schema.** `notes` mirrors `items` in shape (`title`, `body`, `created_at`,
`updated_at`, a generated `search_vector`) plus `pinned boolean` and
`project_id`, nullable, `on delete set null` — the same relationship an item
already has with a project, because a note belongs to a project the same
informal way an item does, not a distinguishable relationship type. A second
join table, `note_tags`, reuses the existing `tags` table rather than
inventing "note tags" or a polymorphic `taggable_type` column — two
many-to-many joins against one vocabulary table is the smallest relational
model that still lets a tag mean the same thing whichever domain applies it.

**The one real risk a fourth tag-bearing domain introduces, and how it is
closed.** `deleteOrphanedTags` used to delete any tag not referenced by
`item_tags`. Once notes can hold tags too, that function would delete a tag
still attached to a note the moment an unrelated item let go of it. The fix is
one `NOT EXISTS` clause added for `note_tags` — see
`src/server/tags/tag-repository.ts` — verified by an integration test that
specifically creates a tag shared by an item and a note and asserts it
survives the item alone dropping it.

**No lifecycle, so no archive.** Delete is immediate, and — the one deliberate
departure from every other row menu in this codebase — gated behind
`window.confirm`. Item and kitchen rows delete on a single click; a note is
judged to hold higher-value, harder-to-recreate content ("things I learned")
than a mistyped kitchen record, which is worth one extra click and nothing
more elaborate. Archiving a note is not built: nothing about "no longer
wanted" needs a second state the way a repeating item's occurrences do
(ADR 022), and adding one now would be speculative.

**Title is never required.** `deriveNoteTitle` (`src/domain/notes/`) takes an
explicit title if given one, otherwise the first non-blank line of the body,
otherwise "Untitled note." The fastest way to capture a fact is to just start
writing, the same instinct behind items needing only text (ADR 013) — a note
should not need a decision made about it before it can exist.

**The `note:` capture prefix, and where the decision lives.** The one global
capture box can produce an item or a note, decided by a single reserved,
case-insensitive prefix — `src/domain/capture/note-prefix.ts`'s
`matchNotePrefix` — checked **before** either service is called, in a new
`src/server/actions/capture-actions.ts` that both the header capture bar and
the command palette now call instead of the old `captureItemAction`. Nothing
about `parseCapture` changed: routing to a different domain is not
"interpreting a capture," and folding it in would mean the item parser has to
know Notes exist, which is exactly the coupling this ADR exists to avoid. A
bare `note:` with nothing after it is treated as "not a note capture" and
falls through to an ordinary item titled "note:", the same "stripping must
leave something" rule ADR 018 and ADR 025 already established for a date or a
repeat phrase that would otherwise swallow the whole capture.

**The bridge back to action is capture, not a new concept.** "Create task from
this note" is a text box seeded with the note's title, posted through the
same, unmodified `captureAction` — no schema linking a note to the item it
produced, no stored relationship, and the note is never touched, deleted or
converted. ADR 013 still holds: this is still just capture, from a different
starting point.

**Notes never reach AI, on purpose.** `captureNote` has no `after()` call and
nothing schedules a suggestion pass for it; the 0.5 classifier is item-only
and stays that way. Trustworthy canonical information has to exist before any
future AI reasoning can be pointed at it — see docs/ROADMAP.md.

**Validated, not assumed: the fourth-domain search seam still holds.** Adding
notes to Universal Search needed a query in `note-repository.ts` and one
mapping function in `search-sources.ts` — nothing in `search-ranking.ts`
changed, because `matchTierFor` already operated on any `(query, title)` pair.
A note found only through its body (title never mentions the query) lands in
the `secondary` tier automatically, the same way an item body-only match
already did; pinned down by an integration test rather than asserted from the
type signature alone. See ADR 028.

---

## 034 · Markdown, stored as plain text and rendered without raw HTML

**Accepted** · 0.8

A note's `body` is markdown source, stored as plain `text` — nothing else.
Rendering is `react-markdown` plus `remark-gfm`, two new dependencies, with
`rehype-raw` deliberately never added.

**Why markdown, stored as text.** It is portable, `grep`-able, inspectable in
the database, easy to export later, and not dependent on any one editor. A
block-editor document model (Notion's own JSON schema, or similar) was
considered and rejected outright: the instruction for this milestone was
explicit that TylerOS is not building a block editor, and a document schema
is exactly the kind of thing this codebase's own rules already forbid — a
generic, speculative structure built before three real uses of it exist.

**Why these two dependencies, and why now.** Nothing in `package.json`
rendered markdown before 0.8. `react-markdown` was chosen over hand-rolling a
renderer or reaching for `marked` + `dompurify` for one reason that matters
more than library popularity: it compiles markdown straight to React
elements and never calls `dangerouslySetInnerHTML` for what it parses, so
safety is the library's default behaviour rather than a sanitisation step
this codebase has to get right and keep right. `remark-gfm` adds exactly the
feature set the milestone asked for — tables, strikethrough, autolinks, and
`- [ ]`/`- [x]` task lists rendered as disabled checkboxes — and nothing this
codebase would otherwise have to hand-write. No `@tailwindcss/typography`: a
third dependency was not justified when a roughly 40-line hand-written
`.note-content` block in `src/app/globals.css`, using the tokens every other
component already uses, covers the same ground.

**The safety property, stated precisely, and how it is checked.** Without
`rehype-raw`, a raw HTML node in markdown source (a literal `<script>...`) is
never turned into a DOM element — it renders as inert, escaped text.
Link and image URLs pass through `react-markdown`'s own `defaultUrlTransform`,
which neutralises non-http(s)/mailto schemes such as `javascript:`. Both are
verified at two levels: a unit test
(`src/components/notes/note-markdown-safety.test.ts`) imports
`defaultUrlTransform` directly and asserts its behaviour on hostile inputs —
a deliberate, narrow exception to "no component tests"
(`.claude/rules/testing.md`), justified because it pins down library
behaviour this codebase's safety story depends on rather than asserting
anything about rendering; and an end-to-end Playwright test
(`e2e/notes.spec.ts`) that actually writes `<script>`, an `onerror` handler
and a `javascript:` link into a real note and asserts, in a real browser,
that nothing executes.

**One real bug this verification found and fixed.** The first version of the
custom link renderer spread every prop `react-markdown` hands a custom
component — including `node`, the underlying hast node — onto the DOM
element, rendering a literal, invalid `node="[object Object]"` attribute on
every link. Caught by inspecting the actual rendered `innerHTML` in a running
dev server, not by reading the type signature; fixed by destructuring `node`
out and dropping it. Recorded here because it is exactly the class of defect
"the types compiled" would not have caught.

**`NoteMarkdown` is a shared, framework-boundary-agnostic renderer.**
`src/components/notes/note-markdown.tsx` has no server-only import and no
`"use client"` directive of its own, so the identical component renders the
persisted body as part of a Server Component (the note page's read view) and
the editor's live client draft (the "Preview" tab in `NoteFields`) — one
implementation of "markdown in, safe React out," not two.

**Considered and rejected:** `dompurify` (needs a DOM; would have meant either
a client-only renderer or a server-side DOM shim for no benefit over a library
that has no injection surface to sanitise in the first place); permitting
`rehype-raw` behind an allowlist of "safe" tags (an allowlist is a promise to
keep maintaining it correctly forever, for a feature — arbitrary embedded
HTML in a personal note — nobody asked for); a hand-rolled regex-based
renderer (markdown's own grammar, including nested lists and fenced code, is
exactly the kind of parsing problem this codebase's own rules say not to
reinvent).
