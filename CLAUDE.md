@AGENTS.md

<!--
Maintainer note (stripped before this file enters Claude's context, so it costs
nothing): this file is for what almost EVERY session needs. Layer-specific
detail belongs in .claude/rules/, which loads only when Claude opens a matching
file. Before adding anything here, ask whether a rule or a doc is the better
home. `pnpm check:context` fails if this file grows past 200 lines.
-->

# TylerOS

A private personal operating system and second brain. It captures what you know,
tracks the current state of your life, and — eventually — helps you decide and
act on it. Single-user, self-hosted, no accounts, no telemetry.

Those three are in order, and the order is the plan: capture first, because
nothing else works without it; then the state of things, which structured domains
like the kitchen record; and only over a system worth keeping true, help deciding.
That last part is barely begun and is no reason to add abstractions.

## Product philosophy

These are decision criteria, not slogans. When a change is defensible on
technical grounds but fails one of these, the philosophy wins.

1. **Useful before intelligent.** Every feature works with AI switched off.
2. **Personal-first.** One user. Not a SaaS product.
3. **Fast to capture into.** Friction at capture is the worst kind of bug here.
4. **Easy to retrieve from.** Nothing may disappear into a disconnected module.
5. **Modular without being over-engineered.** Clean boundaries, no framework.
6. **AI-ready, never AI-dependent.**
7. **Privacy-conscious.** Personal data is sensitive; dependencies are a liability.
8. **Built to be used daily.** UX matters as much as the code.

## The invariant that matters most

**The inbox is a status, not an entity.** Everything captured is an `Item` with a
`kind` and a `status`; `status = 'inbox'` means untriaged. One capture path, one
retrieval surface, one spine that modules extend rather than fork.

Structured records — kitchen inventory, warranties, receipts — are **not items**
and get their own tables. Mostly-null columns on `items` are the signal that this
boundary is being crossed.

Three milestones have tested this and `items` has not gained a column since 0.1.
A jar of olive oil is not an item (`kitchen_inventory`, 0.3) but buying one is
(`kind = 'purchase'`). A repeat stays an item; its four schedule fields went to
`item_recurrence` (0.4) — three fields of one concept's own is the line. What a
model guessed is not a property either (`item_suggestions`, 0.5). ADRs 019, 027.

## Layers

```
src/app/     Routes, React Server Components, Server Actions as the only mutation path
   |
   v
src/server/  Repositories, services, actions. Drizzle lives here and nowhere else
   |
   v
src/domain/  Pure TypeScript + Zod. No framework, no database, no UI
```

Dependencies run **one way**. ESLint enforces it, so a violation fails
`pnpm lint` rather than being noticed a year later.

Deciding where a change belongs: a rule goes in `domain`, a query in a
repository, orchestration in a service, rendering in `app`.

Each layer's conventions live in a path-scoped rule that loads by itself when you
open a matching file: `.claude/rules/domain.md`, `.claude/rules/server.md`,
`.claude/rules/ui.md`, `.claude/rules/database.md`, `.claude/rules/testing.md`.
Read one directly if you are planning work in that area before opening its files.

## Repository map

| Path              | Contents                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`     | Types, Zod schemas, pure rules. Tests sit beside the source                                                          |
| `src/server/`     | `db/`, repositories, services, `actions/`, `ai/` (provider-only), `env.ts`                                           |
| `src/app/`        | Routes. `page.tsx` is Today; one folder per screen                                                                   |
| `src/components/` | `ui/` primitives, `shell/`, `items/`, `projects/`, `kitchen/`, `agenda/`, `search/`                                  |
| `src/lib/`        | Framework-adjacent helpers only (`cn`, search params). Not a dumping ground — a domain concept goes in `src/domain/` |
| `tests/`          | Integration tests + the PGlite harness                                                                               |
| `e2e/`            | Playwright smoke tests. Needs a real database                                                                        |
| `drizzle/`        | Committed SQL migrations                                                                                             |
| `docs/`           | Architecture, ADRs, roadmap, verification checklist                                                                  |

## Commands

```bash
pnpm dev              # development server (needs a reachable DATABASE_URL)
pnpm check            # types, lint, format, context, tests, build — the gate
pnpm check:env        # is this machine ready? node, env, DB, migrations, seed
pnpm check:context    # are CLAUDE.md, the rules and the docs still true?
pnpm test             # vitest, once. No database, no network needed
pnpm test:e2e         # Playwright smoke tests. Needs a real database
pnpm db:generate      # generate a migration after editing schema.ts
pnpm db:migrate       # apply migrations
pnpm db:seed          # realistic sample data
```

`pnpm check` is the gate and must stay runnable with no database. `pnpm test:e2e`
is deliberately outside it. Setup for both supported environments — local Docker,
and no-admin with a remote Postgres — is in `README.md`.

**If the app will not start, run `pnpm check:env` before debugging the code.** A
failing page is far more often a missing `DATABASE_URL` than a bug.

## Engineering rules

- **No `any`.** Not as a cast, not as a generic argument. `unknown`, then narrow.
- **Never swallow an error.** No empty `catch`. Log with context or propagate.
- **No abstraction with one implementation.** No interface, adapter, factory or
  strategy pattern for a single case.
- **No new dependency** unless it is used immediately and nothing already in
  `package.json` does the job. Check first; say why in the commit.
- **No large files in `src/`.** Past ~250 lines, split by concept. (CLI scripts
  under `scripts/` are lists of independent checks and read fine longer.)
- **Prefer a domain concept to a generic utility.** `buildTodayView` > `groupBy`.
- **Naming:** files `kebab-case`; components `PascalCase` named exports; database
  `snake_case` plural. Say what a thing is — `item-repository.ts`, not `utils.ts`.
- **Do not add** authentication, an API layer, a client state library,
  multi-tenancy, or a plugin system — each a recorded decision, not an oversight.
- **AI may only propose.** It never overwrites, never blocks a flow, and is never
  required. Everything works with it switched off, which is the default.

## Protecting the architecture from drift

The main risk to this codebase is not a bug. It is many sessions each making a
locally reasonable choice that quietly replaces an established pattern.

1. **Read the existing implementation before introducing a new pattern.** This
   codebase is small enough to read. Find how it is done and extend that.
2. **Read the relevant ADRs before changing an architectural area.** If
   `docs/DECISIONS.md` names a rejected alternative, it is not one to re-propose.
3. **"Also reasonable" is not a reason to replace a decision.** Only a concrete
   problem with the current approach is. Say what the problem is.
4. **No broad refactors during feature work.** Notice things and mention them;
   change them in their own commit.
5. **Write an ADR for a genuinely significant decision** — a new dependency, a
   boundary moving, a pattern that will be copied. Same change, not later.
6. **Keep the docs true in the same change.** Architecture edits update
   `docs/ARCHITECTURE.md`; a shipped milestone updates `docs/ROADMAP.md` and the
   line below. `pnpm check:context` catches broken references, not stale prose.
7. **Run `pnpm check` before calling work done.** Fix failures rather than
   documenting them. If UI behaviour changed, see `docs/VERIFICATION.md`.

## Where knowledge lives

Put information in one place, and reference it from the others.

| Kind of knowledge                        | Home                               |
| ---------------------------------------- | ---------------------------------- |
| Invariants needed in every session       | this file                          |
| Conventions for one layer                | `.claude/rules/*.md` (path-scoped) |
| How the system is structured now         | `docs/ARCHITECTURE.md`             |
| Why a choice was made, what was rejected | `docs/DECISIONS.md`                |
| Product direction and milestones         | `docs/ROADMAP.md`                  |
| Proving a milestone actually works       | `docs/VERIFICATION.md`             |
| Human onboarding and setup               | `README.md`                        |
| What changed and when                    | git history — not a doc            |

**Critical project truths belong in this repository, never only in session
memory.** Auto memory suits machine-specific facts; if something must survive a
fresh clone, commit it.

**Engineering context is not personal data.** Do not add facts about Tyler's
life, habits or schedule here to help Claude "know the user" — TylerOS itself is
the system responsible for personal context. These files say how to build it.

## Current milestone

Shipped milestones live in `docs/ROADMAP.md`; below is only what a session must
know before touching this code.

**0.5 — Capture suggestions.** One rule: **AI may propose, the user decides,
deterministic facts win.** Proposed kind, project and tags land in
`item_suggestions`, **one row per proposed value**, applied only on acceptance and
only through the ordinary item service. Each row remembers what its field held
when proposed, so a stale one **retires rather than undoing a newer manual
choice**. Precedence is by **omission** — whatever the parser resolved is never in
the request. `src/server/ai/` is the only provider-aware code, the rules are pure
in `src/domain/suggestions/`, and the provider is a **function parameter** like
`db`. Lint forbids UI importing it, or the key ships to the browser. **With no
`ANTHROPIC_API_KEY` it is inert.** ADRs 026–027.

**0.6 — Universal Search.** One query reaches **items, projects and kitchen
inventory**, grouped by domain and led by whichever matched best. Each domain owns
its matching in its own repository; `src/server/search/` composes the three
concurrently and `src/domain/search/` ranks them — the same shape as
`agenda-service.ts`, for the same reason. No `entities` table, no `Searchable`
interface, no registry: a fourth domain adds a query and one mapping function.
Ranking is four tiers, not a score, tied on title then id so the order is total
and assertable. **No migration was needed.** No AI is involved and none may be:
the query leaves no process, and pending suggestions are not searchable. ADRs
028–029.

**Next: semantic retrieval — but only once a real query defeats lexical search.**
