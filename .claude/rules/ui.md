---
paths:
  - "src/app/**/*.tsx"
  - "src/app/**/*.ts"
  - "src/components/**/*.tsx"
  - "src/app/**/*.css"
---

# Working in `src/app/` and `src/components/`

TylerOS has no client state library and no human-facing API layer. The server
renders, server actions mutate for Tyler, and the URL holds view state. Adding
a store or a fetch layer for the UI is a recorded decision to _not_ do — see
ADRs 004 and 006. The first `route.ts` handlers (`src/app/api/runtime/`) are
**machine-only**: a Python (or later Grok) poller acting as a role, not the
browser. UI still must not `fetch("/api/...")`.

## Invariants

- **Server Components by default.** Reach for `"use client"` only when the file
  needs an event handler, a hook, a ref, or a browser API. Ten of roughly thirty
  components are client components today; that ratio should not creep upward.
- **Mutations from the UI go through server actions** in `src/server/actions/`,
  called from a client component. Do not `fetch("/api/...")` from a component —
  those route handlers are the runtime worker boundary (ADR 035), not a UI
  data layer.
- **View state lives in the URL**, not in `useState`. Filters, search terms and
  tags are search params, which is what makes every filtered view a link. See
  `src/components/items/item-filter-bar.tsx`.
- **Pass "today" down from the server.** A client component must not compute the
  current date itself — the two would disagree across a timezone boundary and
  hydration. `ItemRow` takes `today` as a prop for exactly this reason.
- **`params` and `searchParams` are Promises** in this version of Next. Use the
  generated `PageProps<"/route">` and `LayoutProps<"/route">` helpers and `await`
  them.
- **Failures must be visible.** An action returning `{ ok: false }` raises a
  `toast.error` or renders a field error. Never ignore the result — a failed
  action must never look like a successful one.
- **A form that submits through `action={...}` is reset by React when the action
  resolves** — a raw DOM `form.reset()`, on success _and_ on failure. On a slow
  round trip that silently wipes whatever was typed in the meantime, and it
  desyncs controlled fields from their own state. Any form somebody might keep
  editing must own its submit: `event.preventDefault()`, then dispatch inside a
  transition. See `src/components/items/item-form.tsx` and ADR 024.
- **Never sync props into draft state just because the props changed.** Every
  revalidation anywhere in the app delivers new objects, so that rule destroys
  unsaved edits on somebody else's save. Keep the persisted snapshot, the draft,
  and "has the draft moved since the save began" as three separate things, and
  adopt server values only when the draft is clean.
- **Colour carries meaning.** Only due dates are tinted (overdue, due today).
  Use the semantic tokens in `src/app/globals.css`; do not introduce raw hex values or a
  second accent.
- **A new top-level destination goes in the sidebar and the More sheet, not the
  phone's bottom bar.** The bar holds exactly four slots plus More — Today,
  Inbox, capture, Search — chosen for daily use, and adding a fifth link would
  need every tab narrower again, which is the problem 0.7 fixed. See
  `src/components/shell/nav.tsx` and ADR 032.

## Every list and every page needs three states

Loading (`loading.tsx` or a `Skeleton`), empty, and error. Empty states say what
to do next — see `src/components/ui/states.tsx`. A blank panel reading "No items"
makes a new system feel broken rather than new.

## Realistic mistakes this prevents

- Marking a whole page `"use client"` to use one hook, which drags the data
  fetching into the browser and breaks the rendering model.
- Adding React Query or Zustand to "manage" data the server already owns.
- Building a custom listbox instead of a styled native `<select>`. Native opens
  the real picker on a phone and is keyboard accessible for free — ADR 010.
