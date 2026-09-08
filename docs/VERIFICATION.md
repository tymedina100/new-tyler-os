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

`e2e/auth.spec.ts` covers the access boundary the other 31 specs all run
behind — see [0.7](#07--daily-access-foundation--2026-08-26):

32. every top-level destination redirects to sign-in with no session
33. a protected route visited signed out is where sign-in returns to
34. the manifest and the icon load with no cookie at all
35. a wrong passphrase is rejected, visibly, and grants nothing
36. the correct passphrase reaches Today
37. signing out ends the session immediately, everywhere

`e2e/mobile-nav.spec.ts` covers the phone-shaped shell: the four destinations
in the bottom bar, everything else through the More sheet, and that neither
costs a real destination:

38. Today, Inbox and Search are one tap away from the bottom bar
39. capture is one tap away and focuses the box every screen already has
40. the More sheet reaches Upcoming, Tasks, Projects, Notes, Kitchen and the
    shopping list
41. the More sheet can sign out
42. the bottom bar's tap targets meet the 44px floor
43. nothing spills sideways at 375px, on the page or with the sheet open
44. the desktop sidebar still shows every destination, and hides the phone-only
    More button

`e2e/notes.spec.ts` covers Notes & Knowledge (0.8) — the rules and the SQL are
already pinned down without a database or a browser; this proves markdown
actually renders and cannot execute anything, the ADR-024-style draft race
does not exist for notes either, and the `note:` capture prefix really routes
away from the inbox:

45. a note is written, saved, reopened, and reads back with its markdown
    structure intact — headings, lists, a checked and an unchecked checklist
    item, bold and italic
46. an edit made while a save is still in flight is not wiped when it lands
47. pinning moves a note to the top of the list
48. a tag and a project link both stick, and the note appears on the
    project's own page
49. a body-only search term finds the note, and opens it from the results
50. the `note:` prefix in the global capture box creates a note, never an
    item, and it never reaches the inbox
51. deleting a note asks first, and a cancelled confirmation keeps it
52. "Create task from this note" adds an ordinary item to the inbox and
    leaves the note itself untouched
53. hostile markdown — a `<script>` tag, an `onerror` handler, a
    `javascript:` link — never executes, in a real browser
54. the command palette's "New note" never submits a bare `note: ` when the
    query is empty; an empty query routes to the Notes index instead

They **write to the database they point at**. Everything they create is prefixed
`smoke-<run>`, `kt-<run>`, `rc-<run>`, `ed-<run>`, `sg-<run>`, `sx<run>` or
`nt-<run>` and deleted afterwards, but point `DATABASE_URL` at a development
database. `auth.spec.ts` and `mobile-nav.spec.ts` create nothing — they sign in
through the real form (once, in `global-setup.ts`, reused by every other spec)
and otherwise only navigate.

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
- [ ] At 375px the bottom bar's five slots fit, nothing is clipped, and there is
      no sideways scroll. The row menu fits on screen and scrolls rather than
      running off it.

**Keyboard and shape**

- [ ] `Cmd/Ctrl+K` opens the palette; it navigates, captures, and searches, and
      lists Kitchen and the shopping list alongside the rest — see
      [0.7](#07--daily-access-foundation--2026-08-26).
- [ ] Tab reaches every control; the focus ring is always visible.
- [ ] At 375px wide: the four-slot-plus-More bottom bar, nothing clipped, no
      horizontal scroll.
- [ ] In both OS colour schemes, nothing is unreadable.

**Access — signing in, signing out, and staying out until you do**

- [ ] With `AUTH_PASSPHRASE` and `SESSION_SECRET` set, visit any screen signed
      out. Landing is `/login`, and the address bar remembers where you were
      headed (`?next=`).
- [ ] A wrong passphrase is rejected inline, visibly, and nothing further loads.
- [ ] The right passphrase reaches Today, and reloading stays signed in.
- [ ] Sign out from the sidebar (desktop) or the More sheet (phone). The very
      next request for a protected screen returns to `/login`.
- [ ] With neither variable set and `NODE_ENV=development`, every screen is
      reachable with no sign-in step, and the server console says once that
      auth is off.
- [ ] The installed-app checks in
      [PWA / installability](#pwa--installability) below.

**PWA / installability**

- [ ] Chrome's install affordance (address-bar icon or the browser menu) offers
      to install TylerOS, and installing opens it in its own window with the
      "T" mark as its icon.
- [ ] The installed window has no browser chrome — no address bar, no tabs.
- [ ] On iOS Safari, "Add to Home Screen" produces the same "T" icon, not a
      screenshot thumbnail.
- [ ] `/manifest.webmanifest`, `/icon` and `/apple-icon` all load directly in a
      private/incognito window, signed out.

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

**Miles AI briefing — explicit profile, one official API call**

The 06:20 deterministic briefing is unchanged. This path is manual only.

- [x] With zero `ai_execution_profiles`, `/runs` shows **Ask Miles for AI briefing** disabled and does not pick a provider.
- [x] `pnpm ai:profile:add` creates one profile. The database row has no API key.
- [x] Empty Today + AI job completes quietly: `provider=none`, `model=deterministic`, no approval.
- [x] A due-today item + **Ask Miles for AI briefing** with the selected profile produces one proposal. Accept writes exactly one note. Dismiss writes none.
- [x] `/runs` shows Anthropic, the model id, and input/output tokens from the provider. `usage_entries` matches. Capacity remaining is unchanged.
- [x] Live official API call proven — see the Miles AI briefing record below. `/capacity` recent usage shows `estimated_cost_usd=null` as **cost unknown**, not `$0.0000`.

**Standing authority — Miles AI briefing notes only**

Default deny. Tyler grants `miles-ai-briefing-note` explicitly. The 06:20
deterministic briefing is unchanged. Mocked provider results are enough; this
slice does not change the provider path.

- [x] Fresh database has zero `standing_authorities` rows.
- [x] No matching authority: AI briefing → one pending approval, zero notes until Accept.
- [x] `pnpm authority:grant` for Miles + `today_briefing_ai` + `create_note`: AI briefing auto-executes exactly one note through `noteService.captureNote`. Audit status is `auto_executed`, not `accepted`.
- [x] `/runs` shows Completed and **Auto-executed under standing authority** plus `miles-ai-briefing-note`.
- [x] Revoke returns the next run to pending approval. The earlier note stays.
- [x] Wrong role / wrong job kind do not match. The 06:20 briefing still needs Accept.
- [x] Empty Today with authority granted still spends zero tokens and writes no note.
- [x] Concurrent `completeRun` on two PostgreSQL connections creates one usage row, one approval, and one note.
- [x] `POST /complete` cannot auto-save an arbitrary note on `today_briefing_ai`; only validated `/brief` judgment can.

**Notes — does TylerOS now feel like the obvious place to put it?**

- [ ] Write a note with nothing but a first line — no title typed. The title
      shown everywhere afterwards is that first line.
- [ ] Write a substantial note: headings, a bulleted and a numbered list, a
      checklist with one item ticked, **bold**, _italic_, `inline code`, a
      fenced code block, a link. Switch to Preview. Every element renders as
      itself; the checklist items are visibly checked/unchecked and cannot be
      clicked into a different state.
- [ ] Save, reload the page, and the markdown source is exactly what was typed
      — nothing was reformatted or lost in the round trip.
- [ ] Pin a note from its row menu. It moves to the top of `/notes`, ahead of
      more recently edited notes. Unpin it; it drops back to its place by
      recency.
- [ ] Give a note tags and a project. Open the project's own page — the note
      appears in its own "Notes" section, separate from the item lists.
- [ ] Type `note: <something>` into the global capture box and press Enter.
      It appears on `/notes`, never in the Inbox. A bare `note:` with nothing
      after it captures as an ordinary item titled "note:" instead — the
      deliberate edge case, not a bug.
- [ ] From an open note, "Create task from this note" adds an ordinary item to
      the inbox; the note itself is unchanged and not deleted.
- [ ] Delete a note. It asks first; cancelling leaves it exactly as it was.
- [ ] At 375px: the quick-capture box, the editor's Write/Preview toggle, and
      a long fenced code block all stay inside the viewport — a code block
      scrolls sideways inside its own box, the page itself never does.
- [ ] Open the command palette with an empty query. "New note" is offered
      without needing to type anything first, alongside "Notes" in "Go to".

**Universal search — if it went in, it comes back out**

- [ ] Search a word that exists in more than one domain. Items, notes,
      projects and the kitchen each appear under their own heading, and the
      domain of every result is obvious without reading the row.
- [ ] Search a word that appears only in a note's body, never its title. The
      note is still found, under "Notes".
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
- [ ] Build for production with `AUTH_PASSPHRASE`/`SESSION_SECRET` unset
      (`NODE_ENV=production`, not development): the build itself succeeds, the
      server logs the problem once at startup, and every screen except
      `/login`, the manifest and the icons answers `503` rather than serving
      anything.

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
- **`notFound()` rendered under HTTP 200.** `app/loading.tsx` opened a Suspense
  boundary at the root, so the shell streamed — and the status was committed —
  before the page decided it had nothing to show. The screen a person saw was
  right; the status code a machine saw was not. Left open at 0.1 because the
  fix appeared to require giving up the skeleton. **Fixed 2026-09-03:** the
  root `(app)/loading.tsx` is gone. List pages keep their own skeletons via
  nested `loading.tsx` files (route groups for any folder that also has an
  `[id]` detail), so a missing item/project/kitchen/note can return a real
  HTTP 404.

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

---

### 0.7 — Daily Access Foundation · 2026-08-26

**Gate:** `pnpm check` green — 29 files, 691 tests, up from 636 at 0.6.
**Browser:** all 44 specs green (31 pre-existing, 13 new), against the same
remote PostgreSQL 18.6, `pnpm check:env` reporting 4 of 4 migrations —
**no migration was added by this milestone**, which is the expected outcome
of an access/PWA/navigation milestone rather than a gap. `next build`
succeeded twice: with `AUTH_PASSPHRASE`/`SESSION_SECRET` present, and — the
claim that actually needed proving — with both absent.

**The build-vs-runtime split was verified, not assumed.** `src/instrumentation.ts`
was temporarily instrumented to log on module load and on every `register()`
call. A `next build` with both secrets absent produced **zero** output from
either log line, across two separate builds; a real `next start` with the
same absent secrets logged the misconfiguration exactly once, at boot. Every
protected route then answered `503` (`curl` against `/` and `/kitchen`), while
`/login`, `/manifest.webmanifest`, `/icon` and `/apple-icon` all answered `200`
with no cookie. Setting both secrets and restarting: unauthenticated `/` and
`/kitchen` redirected `307` to `/login?next=…`, and `/login` itself served
`200`.

**No secret reaches the client.** `.next/static/` after a production build
was grepped for `AUTH_PASSPHRASE`, `SESSION_SECRET`, `passphraseMatches`,
`createHmac`, the literal test secret value used in this session, and the
module paths `server/auth/session` and `server/auth/auth-config` — zero
matches across all of them. The same strings are present in `.next/server/`,
confirming the absence is the module boundary working rather than dead-code
elimination hiding a real problem.

**A real Chromium session, driven interactively, signed in as itself.** The
in-app browser pane could not composite frames in this session either — the
same limitation recorded at 0.4 through 0.6 — so no screenshots exist here.
Everything below was proven through the DOM, the network log and the console
instead, which is what the plan asked for when a screenshot is unavailable:

- Signed in with a wrong passphrase (rejected inline, visibly, `POST /login`
  still `200`), then with the correct one — landed on Today, sidebar showing
  all seven destinations, open/done counts, and a **Sign out** row.
- capture → Inbox → Today → Kitchen → Search, driven for real: a captured
  item with an inline `#tag` appeared in the inbox under "Needs triage," on
  Today under the same heading, and in Search results with the query word
  highlighted — the same round trip 0.1 first proved, now happening behind a
  session. Cleaned up afterwards by deleting the one row it created.
- At 375px, signed in: the bottom bar reads Today · Inbox · Search · Capture ·
  More, each tab **75×59px**. The More sheet opened and listed Upcoming,
  Tasks, Projects, Kitchen, Shopping list and Sign out; a link from it
  navigated and closed the sheet in one action; Sign out from inside it ended
  the session and the very next request for `/kitchen` redirected to
  `/login`. `scrollWidth` matched `clientWidth` at 375 on Today, Kitchen,
  Projects and with the sheet open.
- `/manifest.webmanifest`, `/icon` and `/apple-icon` all fetched `200` from
  inside the page with no session — confirmed live, not only by `curl`.
- Dark mode (`prefers-color-scheme: dark` emulated) rendered the expected
  near-black background and near-white text; no console errors appeared in
  either colour scheme beyond the pane's own HMR WebSocket noise, present
  before sign-in too and unrelated to this milestone.
- Console across the whole session: only `WebSocket connection … failed` for
  the dev-only HMR socket and one `The destination stream closed early` —
  both pre-existing artefacts of this preview environment, not of the
  application; no error originating in TylerOS's own code appeared at any
  point.

**Two things measurement caught that review had not — both in new UI, both
under the 44px tap-target floor:**

- The More sheet's rows measured **40px**. `py-2.5` matched the rest of the
  app's list rows, which had never been held to a phone tap-target floor
  before there was a sheet to tap on a phone. Now `py-3.5` with `min-h-11`,
  measured at 48px.
- The login form's passphrase field and its Sign In button measured **36px**
  — the shared `Input`/`Button` default (`h-9`) used throughout the rest of
  the app, which has never needed a larger floor because nothing else is the
  very first control an unauthenticated visitor taps on a phone. Given a
  local `h-11` override on this one page rather than raising the shared
  primitive's default height for every form in the application. Now 44px.

Both were found the same way 0.5's chip defect was: by measuring
`getBoundingClientRect()` rather than by reading the code, and both were
fixed and re-measured live via Fast Refresh in the same session, then
re-verified by the full gate and the full browser suite afterwards.

**One interaction limitation of this session's browser pane, distinct from
the screenshot one:** synthetic pointer clicks through the `computer` tool
timed out specifically at the 375px viewport, on elements that clicked
correctly at 1280px moments earlier — apparently the same "pane not
compositing" condition affecting more than screenshots this time. Every
interaction that mattered was still exercised, either via a real DOM
`.click()` / `form.requestSubmit()` dispatched through `javascript_tool`, or
— for the exact gesture this could not confirm interactively — by the
already-green `mobile-nav.spec.ts` result in a real, compositing Chromium
instance under Playwright. The two are complementary rather than one
standing in for the other: Playwright is the authoritative record of the
gesture actually working; this session is the authoritative record of what
the signed-in application actually looks like on the wire and in the DOM at
that width.

### 0.8 — Notes & Knowledge · 2026-08-31

**Gate:** `pnpm check` green — 34 files, 761 tests, up from 29 files / 691
tests at 0.7. **Browser:** all 54 specs green (44 pre-existing — two of them,
`auth.spec.ts` and `mobile-nav.spec.ts`, extended with `/notes` and "Notes"
rather than added — plus 10 new in `notes.spec.ts`), against the same
development database used throughout this project, migration 5 of 5 applied.
`next build` succeeded with the new `notes`/`note_tags` tables and the two new
dependencies (`react-markdown`, `remark-gfm`) in the bundle.

**The migration.** Additive only: `notes` and `note_tags`, mirroring `items`'
generated `tsvector` column syntax exactly (hand-compared against the 0.1
migration before committing). Applied to this session's own development
Neon branch — never to production, which was never touched, deployed to, or
even queried. `deleteOrphanedTags` gained a second `NOT EXISTS` clause for
`note_tags`; the integration suite added a test that specifically proves a
tag shared by an item and a note survives the item alone letting go of it,
which is exactly the regression a fourth tag-bearing domain could introduce
silently.

**The command-palette/keyboard-navigation quirk worth recording — a testing
artifact, not a product bug.** Early manual verification through this
session's own `computer` browser tool made "New note" and even a pre-existing
"Notes" link appear to do nothing on click, and `ArrowDown`/`Enter` appeared
not to move the palette's selection at all. Both traced to this tool's own
key-name handling: `"Down"` and `"Return"` are not the key names this
environment's synthetic keyboard events recognise — `"ArrowDown"` and
`"Enter"` are, confirmed by reading `aria-selected` off the live DOM after
each press. Once corrected, keyboard navigation and selection worked
perfectly, and a real Playwright `.click()` (which dispatches a proper event
sequence) was never in question — `notes.spec.ts`'s own command-palette test
passed on the first correctly-written attempt. Recorded so a future session
does not re-diagnose the same tool quirk as an application defect.

**One real bug this session's manual verification found and fixed, that no
test had caught:** the custom link renderer in `NoteMarkdown` spread
`react-markdown`'s internal `node` prop onto the DOM, producing a literal
`node="[object Object]"` attribute on every rendered link. Found by
inspecting `innerHTML` of a live rendered note in the running dev server, not
by reading the component's types (which compiled cleanly either way). Fixed
by destructuring `node` out and dropping it; re-verified live before writing
the `e2e/notes.spec.ts` assertions that now pin the correct output down.

**A real Chromium session, driven interactively, signed in as itself,** at
1280px and at 375px (via `resize_window`, not device emulation guesswork):

- Created a note through the quick-capture box, opened it, wrote hostile
  markdown (`<script>`, an `onerror` handler, a `javascript:` link, a fenced
  code block containing another `<script>` tag), saved, switched to Preview,
  and read the actual rendered `innerHTML` directly: every hostile fragment
  rendered as inert escaped text or a neutralised empty `href`, and
  `window.__xss` — a sentinel set to `false` before any of it was typed —
  never became `true`.
- The same note, with real content this time (`# Mazda6 maintenance`, a
  bulleted and a numbered list, one checked and one unchecked GFM checklist
  item, **bold**/_italic_): the rendered DOM showed real `<h1>`/`<h2>`,
  `<li>` elements, and two `<input type="checkbox" disabled>` — one of them
  `checked` — confirming the exact structure `notes.spec.ts` asserts.
- A project-scoped quick-capture (`projectId` carried as a hidden field) on
  `Kitchen Refresh`'s own page produced a note that showed up in that
  project's new "Notes" section immediately, and was found by Universal
  Search on a **body-only** word (`stonemason`, never in the title), grouped
  under its own "Notes" heading with a `Project · excerpt` context line.
- The mobile More sheet (375px) listed "Notes" alongside the pre-existing
  destinations; the desktop sidebar showed "Notes" as an always-visible
  seventh-now-eighth entry.
- Deleting a note through the UI required and respected a real
  `window.confirm` dialog, both cancelled and accepted.
- Every manually-created note and project used for this pass was deleted
  again through the running application afterwards; the development database
  was left exactly as it was found (`0 notes`, the same items/projects
  `pnpm check:env` reported before this session began).

**Not verified in this pass:** iOS Safari's "Add to Home Screen" behaviour
specifically with Notes open (covered generally at 0.7 and unaffected by this
milestone); a from-scratch install on a second physical device. Both are
pre-existing gaps in this project's verification, not new ones.

---

### Miles AI briefing — live official API · 2026-09-08

First real AI judgment loop through TylerOS. Manual only. No second paid
call was made after this proof.

**Profile:** `miles-briefing-primary` · anthropic · `claude-opus-5`. The
API key stayed in the TylerOS process environment and is not recorded here.

**Live path:** one material Today item; `/runs` explicitly selected that
profile; **Ask Miles for AI briefing**; authenticated Python runtime claimed
the Miles job; TylerOS made **exactly one** Anthropic Messages request;
structured output validated; **one** `usage_entries` row; **one** proposal;
Accept created **exactly one** note through `noteService`. A second `/brief`
on the same run was rejected (409) and did not make another provider request.

**TylerOS telemetry** (`usage_entries` / the run):

| Field                | Value           |
| -------------------- | --------------- |
| provider             | `anthropic`     |
| model                | `claude-opus-5` |
| input tokens         | 480             |
| cached tokens        | 0               |
| output tokens        | 80              |
| `estimated_cost_usd` | `null`          |

The Anthropic console token delta for that request matched TylerOS. Capacity
remaining was not decremented. TylerOS did not invent a dollar cost.

**External billing guardrail, not TylerOS capacity:** the Anthropic API org
spend cap is currently **$5**. That is an org-wide Console limit. It is not a
TylerOS quota-pool remaining value and is not written into `capacity_pools`.

`/capacity` recent usage must render `estimated_cost_usd=null` as **cost
unknown**. A measured `0` still renders as `$0.0000`.
