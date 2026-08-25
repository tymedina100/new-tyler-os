# Verifying TylerOS

Milestone 0.1 passed types, lint, tests and a production build long before it
was ever driven in a browser against real data, because the machine it was built
on had no PostgreSQL. This file exists so that gap stays deliberate and visible
rather than silent. It has since been closed — see [Recorded
results](#recorded-results).

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
The specs in `e2e/smoke.spec.ts` cover the flows whose breakage would make
TylerOS unusable:

1. the application loads and the shell renders
2. capturing creates an item that reaches the inbox
3. inline `#tags` are parsed out of captured text
4. completing an item takes it out of the inbox
5. search finds captured content
6. a capture is parsed into a date, a project and a tag
7. the inbox can be triaged from the keyboard
8. typing in the capture bar never triggers a triage shortcut
9. several inbox items can be marked and triaged in one keystroke

`e2e/kitchen.spec.ts` covers the structured domain:

10. inventory is added, filtered by location, edited and used up
11. a shopping line is added, bought, and put away into the kitchen
12. expiring food is surfaced on Today without taking the page over
13. the kitchen refuses input that would make it untrue

They **write to the database they point at**. Everything they create is prefixed
`smoke-<run>` or `kt-<run>` and deleted afterwards, but point `DATABASE_URL` at a
development database.

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

**Parsed capture — what the box promises, the item keeps**

- [ ] `pay the electric bill friday` — the preview shows the date before Enter,
      and the stored title is `pay the electric bill`.
- [ ] `order samples @kitchen #home` — the project and tag are chips, and the
      item skips the inbox because it already has a home.
- [ ] `plant the bulbs @Nonsense` — the preview says no such project, the
      reference stays in the title, and no project is created.
- [ ] `monday meeting notes` keeps its whole title. A date is only read from the
      end.
- [ ] Open a parsed item afterwards. Title, date, project and tags are all
      ordinary editable fields; nothing is frozen by how it was captured.

**Keyboard triage — the inbox as a queue**

- [ ] On the Inbox, `j` selects without touching the mouse; `?` lists the keys.
- [ ] `1`–`5` assign a type and the item leaves, with the selection landing on
      whatever took its place rather than being lost.
- [ ] Clicking a row moves the selection there, so mouse and keyboard agree.
- [ ] `Space` marks a run of items; one action key decides all of them; `Esc`
      clears the marks.
- [ ] Typing `a`, `s`, `x` or `t` in the capture bar writes letters and triages
      nothing.

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

**Kitchen — would keeping this be easier than keeping it in your head?**

- [ ] Add something with a name and a location only. That is the whole
      requirement, and the row appears immediately.
- [ ] Add three pantry things in a row. The location stays put between adds.
- [ ] Quantities read like a person: `2 lb`, `8`, `0.5 bag`, `Some`, `Out`.
- [ ] Filter to Fridge. The location badge disappears, because it is now noise.
- [ ] Move something between locations from the row menu, in two clicks.
- [ ] An expired item is red; something due within three days is tinted; the rest
      is plain.
- [ ] "Used it up" removes it _and_ puts it on the shopping list. "Delete"
      removes it and does not.
- [ ] Buy something on the shopping list, then "Put away" into a location — the
      name carries across without retyping.
- [ ] Search a partial word. Kitchen results appear under their own heading, not
      mixed in with items.
- [ ] A negative quantity and a blank name are both refused inline.
- [ ] At 375px the add row is two columns, not five, and food is visible without
      scrolling past the form.

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

## Recorded results

### 0.1 — Life Inbox · 2026-08-25

All three tiers run against a remote PostgreSQL 18. Gate and smoke green; the
manual checklist was walked in Chromium.

Two things the first real browser run exposed:

- **The smoke suite drove the app on `127.0.0.1` while the dev server's origin
  is `localhost`.** Next blocks cross-origin requests to dev-only assets, so
  every client chunk was refused: pages rendered, nothing hydrated, and only the
  progressively-enhanced capture form worked. Fixed in `playwright.config.ts`.
  Worth remembering, because the symptom looks like a broken feature rather than
  a broken origin.
- **`notFound()` renders under HTTP 200.** `app/loading.tsx` opens a Suspense
  boundary at the root, so the shell streams — and the status is committed —
  before the page decides it has nothing to show. The screen a person sees is
  right; the status code a machine sees is not. Open, because the fix is to give
  up the skeleton, which is a product call rather than a bug fix.

### 0.2 — Frictionless capture and keyboard triage · 2026-08-25

All three tiers run against a remote PostgreSQL 18. `pnpm check` green, nine
smoke specs green on three consecutive runs, and the checklist above walked in
Chromium: seven captures mixing dates, projects and tags, four items triaged
from the keyboard alone, Today and Search confirmed, and a parsed item edited
afterwards to prove nothing is frozen by how it was captured.

Two things worth remembering, both found by running it rather than reading it:

- **A controlled capture input loses text typed before hydration.** The first
  version of the preview made the field controlled, so React replaced anything
  typed during load with its own empty initial state. The field is deliberately
  uncontrolled now and mirrors into state only to draw the preview. If a future
  change adds `value` to that input, this comes back — and it looks like a flaky
  test rather than a lost capture.
- **Navigating immediately after a capture cancels it.** A spec that pressed
  Enter and went straight to another page created no item, intermittently. The
  box clearing is the signal that the write finished, for a test and for a
  person watching.

### 0.3 — Kitchen inventory · 2026-08-25

All three tiers run against a remote PostgreSQL 18, after applying migration
`0001_mature_dorian_gray` (a new enum, a new table, three indexes — purely
additive, and `items`, `projects` and `tags` were untouched). `pnpm check` green
at 294 tests, 13 smoke specs green including four new Kitchen flows, and a
realistic session walked in Chromium at 1280px and 375px: seven things added
across all three locations in four different quantity styles, a best-by date, a
move between locations, a quantity corrected after use, a global search, a
delete, and used-it-up → shopping → bought → put away.

Two things found by using it rather than reading it:

- **The mobile add row cost five stacked rows** before any food was visible,
  which is the wrong trade on the one screen most likely to be used standing at
  a fridge. It is a two-column grid on small screens now, and three rows tall.
- **Substring search only matched adjacent words.** "greek yogurt" found the pot
  and "yogurt greek" found nothing. Every word is now required independently, so
  extra words narrow the result instead of breaking it.

And one that is worth knowing before writing tests here: the list page has its
own **Quantity** field in the quick-add row, so a Playwright `getByLabel` that
runs before a row's editor has mounted types into the list instead. Scope to the
form, or wait for "Save changes".
