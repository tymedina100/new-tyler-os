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
Postgres is a requirement to run TylerOS, and `docker-compose.yml` provides one.

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
