# TylerOS

A private personal-life operating system: one place to capture, organise and
retrieve information across a life. Single user, self-hosted, no accounts.

**Current state: Milestone 0.1 — the Life Inbox.** Capture anything in one
keystroke, triage it, and find it again. Everything works without AI.

## What it does today

| Screen       | Purpose                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| **Today**    | Overdue, due today, needs triage, next 7 days. Every item in exactly one place |
| **Inbox**    | Everything captured but not yet decided about                                  |
| **Tasks**    | The working list. Defaults to open tasks; browses any type and status          |
| **Projects** | Collections of related work, with progress                                     |
| **Search**   | Postgres full-text search across everything ever captured                      |

A capture bar sits on every screen. Press `c` to focus it, `Cmd/Ctrl+K` for the
command palette. Inline `#tags` in captured text are parsed out automatically,
so "buy paper towels #home" files itself.

## Requirements

- Node.js 20.11 or newer
- pnpm
- PostgreSQL 14 or newer (16+ recommended)

## Running it

```bash
pnpm install
```

Copy the environment template and adjust if needed:

```bash
cp .env.example .env
```

Start Postgres. A local one is defined in `docker-compose.yml` and matches the
default `DATABASE_URL`:

```bash
docker compose up -d
```

Any Postgres works — a local install, or a hosted development database. Just
point `DATABASE_URL` at it.

Apply the schema:

```bash
pnpm db:migrate
```

Optionally fill it with realistic sample data:

```bash
pnpm db:seed
```

Start the app on http://localhost:3000:

```bash
pnpm dev
```

## Commands

| Command            | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `pnpm dev`         | Development server                                        |
| `pnpm build`       | Production build (needs no database)                      |
| `pnpm start`       | Serve the production build                                |
| `pnpm check`       | Types, lint, tests and build — run before calling it done |
| `pnpm test`        | Vitest, once                                              |
| `pnpm test:watch`  | Vitest, watching                                          |
| `pnpm typecheck`   | Route typegen, then `tsc --noEmit`                        |
| `pnpm lint`        | ESLint, including the architectural layering rules        |
| `pnpm format`      | Prettier                                                  |
| `pnpm db:generate` | Generate a migration from schema changes                  |
| `pnpm db:migrate`  | Apply pending migrations                                  |
| `pnpm db:studio`   | Drizzle Studio                                            |
| `pnpm db:seed`     | Seed sample data                                          |

## Tests

```bash
pnpm test
```

No database setup required. Domain tests are pure functions. Integration tests
boot Postgres in-process via PGlite (real Postgres compiled to WebAssembly),
apply the committed migrations from scratch, and exercise the real SQL —
including full-text search and the generated search vector.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, domain boundaries, where new code goes
- [docs/DECISIONS.md](docs/DECISIONS.md) — why the significant choices were made
- [docs/ROADMAP.md](docs/ROADMAP.md) — what comes next, and what deliberately does not
- [CLAUDE.md](CLAUDE.md) — instructions for coding agents working in this repo

## What this is not

No authentication, no multi-tenancy, no AI. All three are deliberate for 0.1 and
explained in `docs/DECISIONS.md`. TylerOS is designed to be useful before it is
intelligent.
