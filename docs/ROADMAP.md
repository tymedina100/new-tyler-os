# Roadmap

Deliberately short. This is enough future direction to keep the architecture
coherent, and no more — a roadmap of a hundred speculative features is a way of
deciding nothing.

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

---

## 0.2 · Make capture stop needing triage

The single biggest friction in 0.1 is that a captured item still has to be filed
by hand. Close that gap without AI:

- Natural-language dates in the capture bar — "pay electric bill friday"
- Inline `@project` in the capture bar, alongside `#tag`
- Keyboard triage in the inbox: move through items and assign with single keys
- Bulk triage for a backlog

Everything here is parsing and interaction, not intelligence. It is also the
groundwork AI classification would later slot into: the same "propose, then
accept" flow, with a different proposer.

---

## 0.3 · Recurrence and time

The first thing a daily-use system needs that 0.1 lacks.

- Recurring items (weekly bins, monthly bills)
- Timed reminders, which is when a timestamp column earns its place
- A calendar-shaped view of the coming weeks

---

## 0.4 · The first structured module

One module, chosen by which one is actually wanted, built as its own tables
rather than as items. Likely candidates: pantry and freezer inventory, or personal
inventory with warranties.

This milestone matters more than its contents: it is where the "items vs
structured records" boundary in `docs/ARCHITECTURE.md` gets tested for real. If
building it wants to widen the `items` table, the boundary was wrong and should be
fixed before a second module repeats the mistake.

Groceries and meal planning follow naturally from pantry inventory, and should
wait for it.

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

Media tracking, wishlists, notes and memories, household management, routines,
external integrations, specialised agents.

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
