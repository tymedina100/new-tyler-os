# Roadmap

## What TylerOS is for

A private personal operating system and second brain: it captures what you know,
tracks the current state of your life, and — eventually — helps you decide and
act on it.

Those three are in order, and the order is the plan. Capture came first because
nothing else works without it. Tracking state is what 0.3 begins: the system now
holds facts about the world, not only intentions about it. Helping decide comes
last, and only over a system already worth keeping true.

Deliberately short from here. This is enough future direction to keep the
architecture coherent, and no more — a roadmap of a hundred speculative features
is a way of deciding nothing.

One rule: **a milestone ships only when it makes daily use better.** A module that
exists because it appeared on a vision list is a module nobody opens.

---

## 0.1 · Life Inbox — shipped

Universal capture, manual triage, and retrieval.

- Capture from every screen; inline `#tag` parsing
- Items with kind, status, due date, project and tags
- Today, Inbox, Tasks, Projects, Search
- Postgres full-text search
- Tested domain rules and real-SQL integration tests

**Not included, on purpose:** AI, auth, an API layer, recurring items,
notifications, external integrations, file attachments, offline support.

Hardened afterwards, before starting 0.2: session context split into `CLAUDE.md`
plus path-scoped `.claude/rules/`, a `pnpm check:env` readiness check, a
documented no-admin development path using a remote PostgreSQL, and a five-spec
Playwright smoke suite. See ADRs 014, 015 and 016.

---

## 0.2 · Make capture stop needing triage — shipped

The single biggest friction in 0.1 was that a captured item still had to be filed
by hand. Closed without AI:

- Natural-language dates in the capture bar — "pay electric bill friday"
- Inline `@project` in the capture bar, alongside `#tag`
- One parser behind all three, with a live preview so nothing changes invisibly
- Keyboard triage in the inbox: move through items and decide with single keys
- Bulk triage: mark a run with Space, then decide once

Everything here is parsing and interaction, not intelligence. It is also the
groundwork AI classification would later slot into: the same "propose, then
accept" flow, with a different proposer. See ADRs 017 and 018.

**Not included, on purpose:** natural-language editing of existing items,
automatic project creation, and times of day. A date is read only from the end
of a capture, and an `@reference` that cannot be resolved with confidence stays
in the title rather than being dropped.

---

## 0.3 · Kitchen inventory — shipped

The first structured module, brought forward ahead of recurrence because
tracking the state of something real was the more useful next step: TylerOS knew
what you meant to do and nothing about how things actually stood.

- What food is in the fridge, freezer and pantry, in its own tables
- Quantities that can be measured, counted, packaged or simply unknown
- Best-by dates, with expired and expiring-soon called out
- A shopping list on the item spine, and "used it up" joining the two
- Kitchen records in search, shown as kitchen rather than folded into items

This milestone mattered more than its contents: it is where the "items versus
structured records" boundary in `docs/ARCHITECTURE.md` got tested for real. The
boundary held — `items` did not gain a single column. See ADRs 019, 020 and 021.

**Not included, on purpose:** meal planning, recipes, nutrition, barcode or
receipt scanning, unit conversion, a consumption ledger, automatic merging of
similar names, and any inventory outside the kitchen.

---

## 0.4 · Recurrence and time — shipped

Deferred from 0.3, and the largest remaining gap in daily use: the bins go out
weekly whether or not the fridge is catalogued, and nothing in TylerOS could say
so.

- Repeating items — daily, weekly, monthly, and every _n_ of any of them
- Completing one completes **the occurrence**, and the item moves to the next
- Schedules stay anchored: bins done on Thursday are due again on Tuesday
- Missed occurrences do not pile up, and an overdue repeat stays honestly overdue
- Upcoming: the next fortnight, a day at a time, showing work, repeats and
  best-by dates side by side

There are no occurrence rows anywhere — future dates are computed from a rule, so
a schedule with no end costs nothing to store and nothing to keep topped up. The
repeat itself lives in `item_recurrence`, a 1:1 extension table, so `items` has
now gone two milestones without gaining a column. See ADRs 022 and 023.

Kitchen turned out to matter here: a best-by date is a second kind of thing that
happens on a day, and Upcoming shows both without inventory becoming a task.
Each domain keeps its own list on a day rather than being folded into a shared
events table.

**Not included, on purpose:** times of day, reminders and notifications,
external calendar sync, a month grid, recurrence exceptions, habit streaks and
completion history beyond "when was this last done".

---

## 0.4.1 · Daily-use hardening — shipped

Not a feature milestone. Two things stood between 0.4 and actually living in
this system every day, and both were cheap to close before any AI work starts.

- **A save could eat the edit that followed it.** A form submitted through
  React's `action` prop is reset when the action resolves — a raw DOM
  `form.reset()`, on failure as well as success. On a remote database that
  lands a second or more after the click, which is long enough to have started
  typing again. The editor now owns its submit and adopts the server's values
  only when the draft is clean.
- **Recurrence had to be set up after capture.** "take trash out every tuesday"
  now files itself, the way "pay bill friday" has since 0.2 — same closed
  grammar approach, same trailing-phrase safety rule, and the same anchor and
  persistence path the editor uses, so a captured repeat is not a second kind of
  repeat.

The grammar is deliberately small and refuses to guess: daily/weekly/monthly,
every N of them, every other one, every `<weekday>`, fortnightly. Everything
else stays as ordinary title text, including "biweekly", which means two
opposite things depending on who says it. See ADRs 024 and 025.

**Not included, on purpose:** natural-language _editing_ of an existing repeat,
recurrence phrases anywhere but the end of a capture, "first business day" and
"last friday of the month" style rules, and yearly — which the domain has no
frequency for and which `every 12 months` already covers.

---

## 0.5 · AI-assisted capture suggestions — shipped

The first AI in TylerOS, under one rule: **AI may propose, the user decides,
deterministic facts win.**

- Suggested kind, project and tags on a fresh capture, written to
  `item_suggestions` and applied only when accepted
- Accept one and ignore the rest; "Not now" clears the row in a click
- A suggestion that has gone stale can never undo a choice made after it
- Proposals are visibly proposals: dashed chips, where everything TylerOS
  actually knows is solid

Deterministic parsing wins by **omission** rather than by arbitration. A project
the parser resolved, a `#tag` the user typed, a date, a repeat — none is in the
request at all, so there is no later moment where a model's answer and the
user's own syntax have to be reconciled. AI fills gaps in untriaged items and
speaks about nothing else.

The model chooses from a closed vocabulary — the exact kind enum, live project
names, existing tags — and cannot create a project or a tag. Anything that fails
to ground is dropped rather than repaired. The request carries the captured title
and those lists, and nothing else: this is classification, not retrieval.

It runs from `after()`, so it starts once the capture response has been sent.
Enter never waits on a model. Every failure — unconfigured, timeout, 4xx, 5xx,
rate limit, refusal, malformed JSON, an invented project — ends the same way: no
suggestion, one log line, the capture untouched. See ADRs 026 and 027.

**Shipped switched off.** With no `ANTHROPIC_API_KEY`, TylerOS is byte-for-byte
the deterministic application it was in 0.4.1. That is the default state of this
repository, and the state its browser suite runs in.

**Not included, on purpose:** semantic search and `pgvector`, natural-language
retrieval, AI editing of existing items, background scanning of what is already
captured, suggestions for recurrence or dates, a settings screen, a second
provider, and any cost or evaluation dashboard.

---

## 0.6 · Universal Search — shipped

The promise retrieval has to keep: **if it went into TylerOS, it comes back
out.** Search had been item-shaped since 0.1 — the kitchen was shown beside the
results from 0.3, and projects were never searched at all, so "which project was
that?" had no answer at the one place designed to give one.

- One query reaches items, projects and kitchen inventory at once
- Results are grouped by domain and led by whichever matched best, so "chicken"
  opens with the freezer and "monitor" with the items
- A result carries just enough to tell it apart, like `Task · Meal Prep` or
  `Freezer · 2 lb`, and opens that domain's own existing page
- Walkable from the keyboard: Down from the box, Up and Down through the
  results, Escape back. Enter is never intercepted, because a result is a link
- The query lives in the URL, so Back and Forward work and a search is a link

**No migration, and that is the result rather than a shortcut.** Everything
needed was already there: the items `tsvector` from 0.1, and two tables small
enough that a substring scan is not measurable. Three SQL statements per search,
whatever the result count.

Architecturally this is ADR 023 a second time. Each domain keeps the query it
already had for its own reasons, and a service belonging to none of them
composes the answers into a pure projection. No universal `entities` table, no
`Searchable` interface, no registry — a fourth domain joins with a query of its
own and one mapping function. See ADR 028.

**Not included, on purpose:** `pgvector` and semantic search, natural-language
question answering, search history, saved searches, analytics, autocomplete,
filters beyond the item-browsing ones that already existed, and pagination —
needing the fifty-first result means the query was too vague.

---

## 0.7 · Daily Access Foundation — shipped

TylerOS had grown past the point where a new domain was more valuable than
being safe and reliable to actually reach — from a phone, away from the
machine that runs it, without weakening anything the first six milestones
built. This milestone added no domain. It made what already existed
accessible.

- **One authorized identity.** A passphrase and a signed cookie, checked at
  the route boundary (`src/proxy.ts`) and, independently, inside every server
  action — not a second implementation of the same check, but the one
  document Next itself recommends: an optimistic check at the edge, and an
  authoritative one on every mutation, because a page-level check does not
  extend to the actions a page calls. No accounts, no roles, no `user_id`
- **Installable, not offline.** A manifest and a generated icon; TylerOS can
  sit on a home screen and open in its own window. No service worker — a
  cache in front of Server Actions is a way to show stale personal data, not
  a feature this milestone needed
- **A phone gets four destinations, not seven.** Today, Inbox, capture and
  Search in the bottom bar; everything else behind one more tap in a sheet.
  The sidebar keeps all seven, because it has the room to
- **Capture is one tap away from anywhere**, focusing the same box every
  screen already had rather than opening a second one
- **Production defaults are safe, development stays free.** A weak or
  absent secret is a hard failure outside development; inside it, TylerOS
  runs open until a passphrase is set, and says so

Nothing about how AI connects changed. `ANTHROPIC_API_KEY` is still optional,
still absent from this repository's own environment, and 0.5's suggestion
flow is exactly as it was. See ADRs 030, 031 and 032.

**Not included, on purpose:** multiple users, OAuth or any provider-based
auth library, push notifications, offline mutation, a rate-limiting service
(recorded instead as a deployment-time hardening note), and a public
deployment — this milestone stopped at a verified local production build and
asked before anything became reachable on the internet. **Notes and
knowledge**, once suggested for this slot, moved to 0.8 below instead of
being dropped.

---

## 0.8 · Notes & Knowledge — shipped

TASKS answers "what should I do," UPCOMING "what is happening," KITCHEN "what
do I have," SEARCH "where did I put it." Nothing answered "what do I know" —
car maintenance facts, apartment measurements, interview notes, reference
material, a plan that is not a task yet. This milestone gave TylerOS that
fourth answer, as a real domain rather than a nicer textarea.

- **Notes are a standalone domain, not an item kind.** An item's `body`
  remains supporting context for something actionable, exactly as before; a
  `Note` is durable knowledge with no lifecycle at all — it cannot be Done,
  Someday, Archived, or overdue. Item kind `note` (a quick captured thought
  that is still a task-shaped item) is untouched
- **Markdown, stored as plain text.** Headings, lists, checklists, bold,
  italic, code, blockquotes, links — rendered by `react-markdown` +
  `remark-gfm`, with raw HTML in a note always inert, escaped text, never a
  DOM node. No block editor, no document JSON schema
- **A pin, a project link and tags — reusing what already exists.** A boolean
  for "notes I keep needing"; the same `projects` table an item already
  links to; a second join against the existing `tags` table rather than a
  polymorphic relation. No folders, no notebooks
- **A deterministic `note:` prefix** in the one global capture box routes to
  a note instead of an item — explicit, never AI-guessed, and a bare `note:`
  with nothing after it still falls through to an ordinary capture
- **The fourth domain in Universal Search**, found by title or body text,
  needing zero changes to how results are ranked — the seam ADR 028 built
  for a fourth domain held exactly as designed
- **"Create task from this note"** — the smallest possible bridge back to
  action: a text box seeded with the note's title, posted through the
  existing capture path. No stored link between the note and the task it
  produced

Deliberately thin, on purpose: no attachments, no rich-text block editor, no
backlinks or wiki graph, no folders, no version history, no AI anywhere near
a note's content. Trustworthy canonical information has to exist before any
future AI reasoning can be pointed at it. See ADRs 033 and 034.

**Not included, on purpose:** everything the milestone's own scope exclusions
named — image/file attachments, OCR, collaborative editing, sharing,
multi-user, backlinks, a graph view, templates, autosave (an explicit Save
proved simpler to make correct than a live-saving draft), and any AI
summarisation, tagging or embedding of note content.

---

## Shipped · autonomous wake-up

Miles weekday morning briefing, owned by the control plane.

A typed `schedules` row (not a worker clock, not an agent) enqueues at most one
`today_briefing` per local date for Miles, unpinned to Python. Empty Today
completes quietly. Stale observe runs recover, three attempts then fail.
See ADR 036.

---

## Now · runtime fleet + capacity ledger

Execution instances, hashed credentials, an append-only usage ledger, and
quota pools you record yourself. Health is derived from last seen.
`/capacity` is a read of real state. Automatic provider routing is not in
this slice. See ADR 037.

Deliberately not in this slice: cheapest-model algorithms, scraping
subscription pages, a game-style world, or collapsing Miles into a runtime.

---

## Next · semantic retrieval, once something needs it

Deferred from 0.6 deliberately, not skipped. Until now retrieval reached one
table out of three, so every failure to find something had a mundane
explanation, and embeddings would have been a sophisticated answer to a question
nobody had asked yet.

What would justify it: real, repeated searches that fail because the words
stored and the words remembered genuinely differ — "that thing about the leaky
tap" against an item titled "call the plumber". Worth writing those down as they
happen; they are the evidence, and there is currently none. See ADR 029.

Constraints that do not move: the core keeps working with AI switched off, AI
code stays in `src/server/ai/*`, and the domain never imports it. Search is used
dozens of times a day, so it is the last flow that should ever need a key.

---

## Later, and only if wanted

Meal planning and recipes, media tracking, wishlists, household management,
routines, external integrations, specialised agents. Notes and knowledge,
once on this list, shipped in 0.8.

Meal planning is the one 0.3 unlocked, and the one most likely to be asked for
next. It should still wait: it needs comparable quantities, which ADR 020
deliberately did not build, and it is only worth anything once the inventory is
actually being kept true.

These are all reachable from the current model — most are a `kind` on the item
spine or one new table. None of them should be built before something in the list
above is missed daily.

---

## Things that would be mistakes

Recorded so they do not get proposed again as improvements:

- A plugin or module framework before there are three real modules to generalise
  from
- Multi-tenancy or an account system for a single-user application
- Replacing Server Actions with a human-facing API layer "for flexibility"
- Turning TylerOS into a generic job queue that replaces Miles → specialist
  ownership. Runtimes execute under roles; they do not become the org chart.
- A generic custom-fields or user-defined-schema system
- Making AI a dependency of any core flow
- Dashboards, charts or analytics about personal data nobody acts on
- Storing personal-life facts in repository instruction files. TylerOS is the
  system responsible for personal context; the repo describes how to build it
- A process-local counter presented as rate limiting. It is not a real
  boundary once more than one server instance can run, and shipping one
  anyway is exactly the security theater ADR 030 was asked to avoid
