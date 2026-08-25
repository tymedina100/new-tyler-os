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

## 0.4 · Recurrence and time

Deferred from 0.3, not dropped. The bins go out weekly whether or not the fridge
is catalogued, and this is still the largest gap in daily use.

- Recurring items (weekly bins, monthly bills)
- Timed reminders, which is when a timestamp column earns its place
- A calendar-shaped view of the coming weeks

Kitchen makes this slightly more interesting than it was: a best-by date is a
second kind of thing that happens on a day, and whatever calendar view arrives
should be able to show both without inventory becoming a task.

---

## 0.5 · AI, as a proposer

Only after the manual system is genuinely in daily use, because AI that improves
an unused system improves nothing.

- Suggested kind, project and tags on capture — written to a suggestions table,
  never over the user's own data
- Semantic search via `pgvector`, alongside the existing full-text index
- Natural-language retrieval over captured items

Constraints that do not move: the core must keep working with AI switched off, AI
code stays in `src/server/ai/*`, and the domain never imports it.

---

## Later, and only if wanted

Meal planning and recipes, media tracking, wishlists, notes and memories,
household management, routines, external integrations, specialised agents.

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
- Replacing Server Actions with an API layer "for flexibility"
- A generic custom-fields or user-defined-schema system
- Making AI a dependency of any core flow
- Dashboards, charts or analytics about personal data nobody acts on
- Storing personal-life facts in repository instruction files. TylerOS is the
  system responsible for personal context; the repo describes how to build it
