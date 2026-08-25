---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**/*.tsx"
  - "src/app/**/*.css"
---

# Working in `src/app/` and `src/components/`

TylerOS has no client state library and no API layer. The server renders, server
actions mutate, and the URL holds view state. Adding a store or a fetch layer is
a recorded decision to _not_ do — see ADRs 004 and 006.

## Invariants

- **Server Components by default.** Reach for `"use client"` only when the file
  needs an event handler, a hook, a ref, or a browser API. Ten of roughly thirty
  components are client components today; that ratio should not creep upward.
- **Mutations go through server actions** in `src/server/actions/`, called from a
  client component. No `fetch("/api/...")` — there are no route handlers.
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
- **Colour carries meaning.** Only due dates are tinted (overdue, due today).
  Use the semantic tokens in `src/app/globals.css`; do not introduce raw hex values or a
  second accent.

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
