# Verifying TylerOS

Milestone 0.1 passed types, lint, tests and a production build, but was never
driven in a browser against real data — the machine it was built on had no
PostgreSQL. This file exists so that gap is deliberate and visible rather than
silent.

There are three tiers of confidence. Each costs more than the last, and each
catches things the one before it cannot.

| Tier       | Command         | Needs           | Catches                                            |
| ---------- | --------------- | --------------- | -------------------------------------------------- |
| **Gate**   | `pnpm check`    | nothing         | types, lint, domain rules, SQL, context rot, build |
| **Smoke**  | `pnpm test:e2e` | a real database | the app is actually wired together                 |
| **Manual** | the list below  | a real database | whether it is pleasant to use                      |

`pnpm check` is required for every change. The other two are required before
calling a **milestone** complete.

## Before you can verify anything

```bash
pnpm check:env
```

This reports Node, `DATABASE_URL`, connectivity, migration state and whether the
database has data, with the command to run for whatever is missing. Setup for
both supported environments is in [../README.md](../README.md).

## Automated smoke tests

```bash
pnpm test:e2e            # headless
pnpm test:e2e --headed   # watch it happen
pnpm test:e2e --ui       # step through interactively
```

Playwright starts the dev server itself and reuses one that is already running.
Five specs in `e2e/smoke.spec.ts` cover the flows whose breakage would make
TylerOS unusable:

1. the application loads and the shell renders
2. capturing creates an item that reaches the inbox
3. inline `#tags` are parsed out of captured text
4. completing an item takes it out of the inbox
5. search finds captured content

They **write to the database they point at**. Everything they create is prefixed
`smoke-<run>` and deleted afterwards, but point `DATABASE_URL` at a development
database.

This suite is deliberately outside `pnpm check`. A gate that needs a database is
a gate that gets skipped, and then the fast tests rot with it.

## Manual checklist

Automated smoke tests prove the app works. They cannot tell you whether it is
worth using. Walk this before closing a milestone — it takes about five minutes.

Run `pnpm db:seed` first so there is realistic content to judge.

**Capture — the thing that must never feel slow**

- [ ] Press `c` from anywhere. The capture bar takes focus without scrolling the page.
- [ ] Type and press Enter. The field clears and keeps focus, ready for the next one.
- [ ] Capture `something #atag`. The tag is stripped from the title and shown as a chip.
- [ ] Submit an empty capture. It is refused inline, not silently ignored.

**Today — the screen that must not become noise**

- [ ] Overdue, due today, needs triage and next 7 days appear in that order.
- [ ] No item appears in two sections.
- [ ] With nothing due and an empty inbox, the empty state says something useful.

**Triage and lifecycle**

- [ ] The row menu assigns a type, and the item leaves the inbox.
- [ ] "Today" and "Tomorrow" set the due date; the badge colour changes for overdue.
- [ ] The completion circle responds instantly, before the server replies.
- [ ] Reopening a completed item works, and it comes back as active.
- [ ] Archive, then restore — the item returns to the inbox.

**Projects and search**

- [ ] Project progress reflects completing an item.
- [ ] Capturing from a project page skips the inbox.
- [ ] Deleting a project keeps its items; they simply lose the project.
- [ ] A partial word finds a full title (`sever` → `watch Severance`).
- [ ] Filters survive a reload, because they live in the URL.

**Keyboard and shape**

- [ ] `Cmd/Ctrl+K` opens the palette; it navigates, captures, and searches.
- [ ] Tab reaches every control; the focus ring is always visible.
- [ ] At 375px wide: bottom tab bar, nothing clipped, no horizontal scroll.
- [ ] In both OS colour schemes, nothing is unreadable.

**Failure states — the ones nobody checks**

- [ ] Stop the database and reload. The error screen names the likely cause.
- [ ] Visit `/items/00000000-0000-4000-8000-000000000000`. It is a clean 404.
- [ ] Stop the database and try an action. A toast reports the failure; it does
      not look like it worked.

## Recording the result

Note in the milestone's final commit or PR which tiers were run. If a tier was
skipped, say so and why — "not verified" is useful information, and a summary
that implies otherwise is worse than no summary.
