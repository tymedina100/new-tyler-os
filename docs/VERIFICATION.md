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

`e2e/recurrence.spec.ts` covers the one thing recurrence must never get wrong:

14. a repeat typed into the capture bar is previewed, then filed
15. a captured repeat carries a project and a tag with it
16. a captured repeat advances by its schedule, not by when it was done
17. a repeating item is completed one occurrence at a time
18. recurrence is created, changed and removed from the item editor
19. Upcoming shows the days ahead, including repeats that have no row yet

`e2e/editor-draft.spec.ts` covers the item editor's draft, which is the only
place in TylerOS where unsaved keystrokes exist and so the only place they can be
lost:

20. an edit made while a save is still in flight is not wiped when it lands
21. a clean save adopts what the server actually stored
22. a failed save keeps the draft and says what was wrong
23. several saves in one sitting each land

`e2e/suggestions.spec.ts` covers AI suggestions — **with no AI in the run**. The
provider is not mocked, it is absent: proposals are written straight into
`item_suggestions`, which is exactly what a real pass leaves behind, and what is
asserted is everything that happens afterwards.

24. a suggestion is offered, accepted, and applied to the item
25. a suggestion can be waved away without touching the item
26. a stale suggestion cannot undo a choice the user made first

A spec that called a live model would fail on a Tuesday because a sentence came
back `note` instead of `task`. The classification itself is covered where it can
be covered honestly: pure rules in `src/domain/suggestions/`, and a substituted
`Classifier` in `tests/integration/suggestions.test.ts`.

`e2e/search.spec.ts` covers universal retrieval — the ranking is already pinned
down without a database, so these cover only what a browser can prove:

27. one word comes back from every domain, grouped by where it came from
28. a result is reached and opened from the keyboard alone
29. each domain's result opens that domain's own page
30. Back returns to the results, because the query is the URL
31. the results are usable on a phone, with nothing spilling sideways

The last two are measurements rather than judgements: `scrollWidth` against
`clientWidth` at 375px, every row inside the viewport, and a 44px floor on the
tap target. A screenshot would prove none of it.

They **write to the database they point at**. Everything they create is prefixed
`smoke-<run>`, `kt-<run>`, `rc-<run>`, `ed-<run>`, `sg-<run>` or `sx<run>` and
deleted afterwards, but point `DATABASE_URL` at a development database.

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

**Repeats — the one thing that must never get quietly wrong**

- [ ] Give a task due today a repeat from the row menu. The toast names the
      schedule ("Every Tuesday"), and a Weekly badge appears on the row.
- [ ] Tick it off. It does **not** go to Done: a toast says when it is next due,
      and the row moves to that date.
- [ ] Tick off a repeat that is already overdue. The next date is the next one on
      the schedule, not a period counted from today.
- [ ] Open a repeating item. Status offers no "Done" — only occurrences finish.
- [ ] Change the repeat in the editor. The sentence underneath updates as you
      type, and naming a different date changes which weekday it says.
- [ ] Set a repeat to monthly on the 31st and complete it in a short month. It
      lands on the 28th, and the month after that is the 31st again.
- [ ] "Skip this one" moves it on without claiming it was done.
- [ ] "Stop repeating" leaves the date alone and brings back "Clear due date".
- [ ] Clearing the date of a repeating item is refused, not silently obeyed.

**Captured repeats — read the preview before trusting it**

- [ ] Type `take trash out every tuesday`. Before Enter, the preview reads the
      title without the repeat words, the coming Tuesday, and "Every Tuesday".
- [ ] Enter. The row carries a Weekly badge and the button says "complete this
      occurrence".
- [ ] `clean bathroom every 2 weeks #home` — repeat and tag, both taken.
- [ ] `review budget monthly` with no date — it starts today, same as making an
      undated item repeat in the editor does.
- [ ] One with `@project`, and one with an explicit date (`report every 2 weeks
friday`) — the stated date is the one it starts on.
- [ ] `read Every Day by David Levithan` keeps every word and gets no preview.
      So do "swim twice a week", "sync biweekly" and "audit every 500 days".
- [ ] Open a captured repeat in the editor. It is an ordinary repeat: the same
      controls, the same sentence, nothing frozen by how it was created.

**The editor draft — the one place keystrokes can be lost**

- [ ] Edit a field, Save, and immediately start editing something else. Wait a
      few seconds. The second edit is still there, and the repeat select still
      agrees with the sentence beneath it.
- [ ] Save that second edit and reopen the item. It persisted.
- [ ] Make a save fail (nine tags). The error shows and nothing you typed is lost.
- [ ] Save three times in one sitting. Each one lands.

**Upcoming — the near future, without becoming a calendar**

- [ ] Tomorrow, then weekdays, then dates. Days with nothing on them are absent.
- [ ] A repeating item appears on every day it will come round, drawn as a muted
      line rather than a row — those occurrences have no checkbox, because they
      are not the occurrence that is due.
- [ ] Food going off appears on its own day, under the same heading style.
- [ ] With nothing in the fortnight, the empty state points back at Today.
- [ ] At 375px the seven tabs fit, nothing is clipped, and there is no sideways
      scroll. The row menu fits on screen and scrolls rather than running off it.

**Keyboard and shape**

- [ ] `Cmd/Ctrl+K` opens the palette; it navigates, captures, and searches.
- [ ] Tab reaches every control; the focus ring is always visible.
- [ ] At 375px wide: bottom tab bar, nothing clipped, no horizontal scroll.
- [ ] In both OS colour schemes, nothing is unreadable.

**AI suggestions — start by checking they are not there**

The first two apply to every machine. The rest need `ANTHROPIC_API_KEY` set, and
are skipped otherwise — say so rather than implying they passed.

- [ ] With no `ANTHROPIC_API_KEY`, capture several items and open the inbox.
      There is no "Suggested" row anywhere, and the server log says nothing
      about suggestions. This is the shipping default.
- [ ] Set `AI_SUGGESTIONS=off` with a key present. Same result.
- [ ] With a key set, capture "replace air filter". Enter returns instantly —
      the box clears with no perceptible pause. That is the requirement; a
      suggestion appearing later is a bonus.
- [ ] Open the inbox a moment later. Any proposal is a **dashed** chip, plainly
      different from the solid badges beside it.
- [ ] Accept one chip and ignore the others. Only that one applies; the rest stay.
- [ ] Capture `clean bathroom every tuesday @Home #urgent`. The project, the
      tag, the repeat and the date are all the parser's, and no suggestion
      contradicts any of them.
- [ ] Change a suggested field yourself, then accept the stale chip. It says
      your own choice was kept, and the item does not move.
- [ ] Press "Not now". The row goes, and does not come back on reload.
- [ ] Break the key deliberately (edit a character) and capture. The capture
      lands normally, no error reaches the screen, and the server log shows one
      line naming a failure category.

**Universal search — if it went in, it comes back out**

- [ ] Search a word that exists in more than one domain. Items, projects and the
      kitchen each appear under their own heading, and the domain of every
      result is obvious without reading the row.
- [ ] The heading order follows the best match: a word that _is_ a food name
      leads with Kitchen, one that starts an item title leads with Items.
- [ ] A result carries just enough to pick it out — a location and a quantity, a
      kind and a project — and nothing that belongs on the record's own page.
- [ ] Open one result from each domain. Each lands on that domain's existing
      page, not on anything search invented.
- [ ] Press Back. The results are still there and the query is still in the box.
- [ ] From the query box press Down. The first result takes focus. Down and Up
      walk the list across group boundaries; Escape returns to the box.
- [ ] With a result focused, press Enter. It opens — nothing intercepted it.
- [ ] Type a word that appears nowhere. The empty state names what was searched
      and suggests what to do, rather than showing a blank panel.
- [ ] Clear the query. The page invites a search rather than listing everything.
- [ ] At 375px: the box is usable, headings and rows are readable, a long name
      wraps, and nothing scrolls sideways.

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

### 0.4 — Recurrence and time · 2026-08-25

All three tiers run against the same remote PostgreSQL 18, after applying
migration `0002_late_winter_soldier` (one enum, one table, one foreign key, one
check constraint — purely additive, and `items`, `projects`, `tags` and
`kitchen_inventory` were untouched). `pnpm check` green at **381 tests across 20
files**, **16 smoke specs green** including three new recurrence flows, and the
checklist above walked in Chromium at 1280×720 and 375×812: a repeat created
from the row menu and from the editor, completed, skipped, edited, re-anchored
by moving its date, and stopped; Upcoming read at both widths with a daily
repeat projected across all thirteen remaining days of the fortnight.

Two things found by running it rather than reading it:

- **The row menu stopped fitting on the screen.** Adding five repeat presets took
  it to 662px in a 720px window, and it would have run off the bottom of a phone.
  It now caps itself at the height Radix reports as available and scrolls. Worth
  knowing that the menu was already close to the edge at twelve entries — the
  next thing added to it should check again.
- **The kitchen editor spec was flaky for exactly the reason 0.3 wrote down.**
  `getByLabel("Quantity")` resolved against the quick-add row on the page being
  navigated away from. A recorded hazard that nobody acted on is a hazard; it
  waits for the editor now.

One caveat about the manual tier, since it looks like a bug the first time: a
dev preview rendered in a **hidden** browser pane never leaves its loading
skeleton. React reveals streamed Suspense content from a `requestAnimationFrame`
callback, and a pane that is not compositing never fires one. The server is fine
— `fetch()` returns the whole document. Playwright is the authoritative
interactive run for that reason.

### 0.4.1 — Daily-use hardening · 2026-08-26

All three tiers run against the same remote PostgreSQL 18. No migration: this
milestone added no schema. `pnpm check` green at 479 tests in 21 files, the
browser suite green at 23 specs on two consecutive full runs, and both product
goals driven by hand in Chromium at 1280px and 375px.

The manual pass was the point rather than a formality, and it covered what the
brief asked for: thirteen representative captures previewed before Enter —
including the five that must stay ordinary text — then one captured repeat filed,
completed (advancing 1 September to 8 September, still weekly, still open), and
finally the editor race walked end to end: edit, Save, immediately retype, wait,
draft intact, save it, reopen, persisted. No console errors at either width and no
horizontal overflow.

Three things worth remembering, all found by running it rather than reading it:

- **The handoff's description of the editor bug was wrong in a way that would have
  produced the wrong fix.** It read as "revalidation re-renders the editor and
  resets its local state", which points at syncing props into state. It is not
  that. React 19 schedules `requestFormReset` for any form submitted through its
  `action` prop, and at commit `recursivelyResetForms` calls a raw DOM
  `form.reset()`. Nothing remounts and nothing syncs — the DOM is simply reset
  underneath React. Proved with a throwaway spec that marked the live nodes with
  an expando: the marks survived, so there was no remount, while the values
  reverted. Worth doing that before choosing a fix rather than after.
- **The bug was bigger than reported.** A _rejected_ save wiped edits too, because
  the reset is scheduled on submit rather than on success. And the controlled
  repeat select desynced from its own state, leaving "Does not repeat" on screen
  beside a sentence reading "Every 2 weeks" — saving from there would have deleted
  the schedule the screen was promising to keep. The regression spec fails on all
  four of its cases with the fix removed, which is the only way to know it is a
  regression spec at all.
- **`pnpm check` was broken for anybody who had run the browser suite first.**
  ESLint does not read `.gitignore`, so it linted the Playwright report left
  behind by `pnpm test:e2e`; a trace bundle carries multi-megabyte vendor
  JavaScript, and the stylish formatter dies on it with `RangeError: Invalid
string length`. The gate failed naming neither cause nor fix. Fixed by ignoring
  the generated directories.

And two notes for whoever writes the next browser spec here:

- **The "Saved." toast is not a synchronisation signal.** It lingers after one
  save and expires during the next, so asserting on it passes against a stale
  toast — and then a `page.reload()` aborts the save still in flight. Two of the
  four new specs failed this way before switching to `waitForResponse`. This is
  the same trap 0.2 recorded for capture, in a new costume.
- **The first spec of a cold run races Next's first compile of a route.** A 5s
  `toHaveValue` on `/items/[id]` is not always enough. Passing in isolation and
  failing as spec number one is that, not flakiness in the product.

The parser's own edges are covered by fast tests rather than by hand: 56 in
`recurrence-phrase.test.ts` and 37 more in `parse-capture.test.ts`, including
every phrase in the grammar, every alias, the false positives above, out-of-range
intervals, and month, week and year boundaries.

### 0.5 — AI-assisted capture suggestions · 2026-08-26

Gate and smoke green. Manual verification was **partial by necessity**, and the
split matters more than usual for this milestone, so it is spelled out.

**Gate.** 24 test files, 578 tests, up from 21 and 479. No network, no database,
no API key — unchanged, and that is the point: the provider seam is a function
parameter, so a fake is a lambda rather than a mocked module.

**Smoke.** All 26 specs green against a remote PostgreSQL 18, including the 23
that predate this milestone. They ran with **no `ANTHROPIC_API_KEY` set**, so
that pass is itself the AI-disabled verification: capture, triage, recurrence,
kitchen and the editor draft all behave exactly as they did in 0.4.1.

**Migration.** `0003_high_tombstone.sql` applied to real PostgreSQL 18;
`pnpm check:env` reports 4 of 4 and correctly reported 3 of 4 beforehand.

**Live provider: not verified, because there is nothing to verify with.** No
`ANTHROPIC_API_KEY` exists in the environment, the user profile, the machine, or
`.env`. Application API access is a separate paid product from a Claude
subscription, so obtaining one is a billing decision that is not this
milestone's to make. Everything up to that line is built and tested; the request
itself has never been sent to Anthropic. The prompt, the wire shape and the
response handling are covered by their own tests, but nobody has yet seen this
code get a real answer.

**What the browser confirmed, and what it could not.** The inbox with AI
unconfigured renders identically to 0.4.1 — no suggestion row, and the capture
action logged nothing about suggestions. With fixture rows inserted, the row
rendered with correct semantics ("Suggested", "Set type to Task", "File under
X", "Add the tag y", "Dismiss suggestion: …", "Not now") and the chips computed
as `border-style: dashed` against the real badges' `solid`.

Interactive acceptance could **not** be driven in the in-app browser pane: it
never hydrated there (`__reactProps` absent, HMR socket refused, and every
element inside `main` reporting a zero-size rect — including the pre-existing
`h1`, so not a fault in the new component). Capture still worked there through
progressive enhancement, which is a decent accident: it demonstrates the form
POST path works with no JavaScript at all. The click-through was verified in
Playwright's Chromium instead, three times over, which is the stronger evidence
anyway.

**Two things measurement caught that review had not:**

- The chips were **20px tall**, under the 24px minimum a tap target wants. Found
  by measuring `boundingBox()` at 375px rather than by looking, which is the
  only way that particular defect is ever found. Now 24px, at both widths, with
  zero horizontal overflow.
- `getByLabel("Type")` matched the chip labelled "Set type to Task" as well as
  the editor's `<select>`. A test-authoring fault rather than a product one, but
  it is a fair warning that two controls on one page now answer to "type".

**One bug caught before any database saw it.** The first version of the unique
proposal index was a single index over `coalesce(kind::text, project_id::text,
tag_name)`. Postgres rejects it — casting an enum to text is only STABLE, not
IMMUTABLE. The PGlite harness applies migrations from scratch on every run, so
this failed in `pnpm test` seconds after being written rather than on a real
database later. That is the whole argument for that harness, paid back again.

**Skipped on purpose:** the live-provider checklist items above, and the OS
colour-scheme pass for the new row (it uses only existing semantic tokens and
introduces no colour of its own).

---

### 0.6 — Universal Search · 2026-08-26

**Gate:** `pnpm check` green — 26 files, 636 tests, up from 578 at 0.5.
**Browser:** 31 specs green, five of them new. `pnpm check:env` green against a
remote PostgreSQL 18.6, 4 of 4 migrations applied — **no migration was added by
this milestone**, which was the intended outcome rather than a gap.

**Verified with AI switched off, because there is nothing to switch on.** No
`ANTHROPIC_API_KEY` is set on this machine, so every number above was produced by
the deterministic application. That is not a separate pass: it is the only state
this milestone was ever exercised in, and search reaches no AI code by
construction — a grep of `src/domain/search/`, `src/server/search/`,
`src/components/search/` and the page finds no provider import, no `fetch`, and
no reference to suggestions outside a comment explaining their exclusion.

**Measured rather than eyeballed:**

- **Three SQL statements per search, whatever comes back.** Instrumented through
  Drizzle's query logger against the development database: a query returning 27
  results and one returning 3 both cost exactly three statements. That is the
  no-N+1 claim as a number rather than an assurance.
- **~90ms** for `searchEverything` against a remote Neon instance, most of it
  network; **~160ms** for the whole page over HTTP. The three domain queries run
  concurrently, so the cost is the slowest, not the sum.
- **Zero horizontal overflow at 375px** — `scrollWidth` 375 against `clientWidth`
  375, asserted in the smoke suite rather than judged from a screenshot. Every
  result row sits inside the viewport and the first is 44px tall or more, which
  is the tap-target floor.
- **Zero console errors and zero warnings** across four page states — no query,
  a matching query, a query matching nothing, and the tag-filter path — plus a
  second pass at 375px.

**Keyboard, checked for what it does not do as much as what it does.** Down from
the query box focuses the first result, Down and Up walk the list across group
boundaries, Escape returns to the box. Enter is never intercepted — the assertion
that it opens the focused result is really an assertion that a result is still an
ordinary link, so open-in-new-tab and Tab order come from the browser rather than
from this code.

**One regression, caught by the existing suite.** The kitchen spec asserted the
search group heading read "In the kitchen". It reads "Kitchen" now, because there
are three parallel headings rather than one exception beside items. The spec's
point was that a kitchen record is shown as kitchen and never folded into items;
it now asserts that twice over, including that no Items heading exists for the
record to have been folded into.

**A false pass caught in the tooling, before any code was written.** The first
baseline `pnpm check` of this session reported exit 0 without ever running:
output was redirected to a path that did not exist, so the reported status came
from the trailing `echo`. Exactly the failure shape commit `46d2c47` documents,
arriving by a different route than the one it fixed. The lesson is the same and
worth restating: **a command's exit code is only evidence if nothing stands
between it and the report.**

**Skipped on purpose:** the in-app browser pane could not composite frames in
this session, so no screenshots were taken. Every visual claim above was
converted into a measurement in Chromium instead, which is stronger evidence than
a screenshot would have been — but "looks right" was not assessed by eye at
either width, and that is the gap.
