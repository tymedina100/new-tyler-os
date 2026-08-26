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
| **Search**   | PostgreSQL full-text search across everything ever captured                    |

A capture bar sits on every screen. Press `c` to focus it, `Cmd/Ctrl+K` for the
command palette. Inline `#tags` in captured text are parsed out automatically, so
"buy paper towels #home" files itself.

## Requirements

- **Node.js 22.11+** and **pnpm**
- **PostgreSQL 14 or newer**, reached by a connection string (the bundled
  `docker-compose.yml` uses 17)

Tests need neither PostgreSQL nor a network — see [Tests](#tests).

**`pnpm: command not found`, with Node installed?** Node ships Corepack, which
resolves the pinned `pnpm`, without putting it on `PATH` by default — and on
Windows, the directory Corepack shims into by default (next to `node.exe`)
usually needs administrator rights to write to. No admin required: point
Corepack at a directory you can already write to and that is already on your
`PATH` — npm's own global prefix works well and usually needs no setup of its
own:

```bash
corepack enable --install-directory "$(npm config get prefix)"
```

Open a new shell and confirm with `pnpm --version` — it should print the
version pinned in `package.json`'s `packageManager` field. `pnpm check:env`
reports this too, and fails if some other install shadows the pinned one.

## Setup

```bash
pnpm install
cp .env.example .env
```

Then get a database. Pick whichever describes your machine.

### With Docker or a local PostgreSQL

The default `DATABASE_URL` in `.env.example` already matches the server defined
in `docker-compose.yml`:

```bash
docker compose up -d
```

Using a PostgreSQL you installed yourself instead? Create a database and edit
`DATABASE_URL` to match.

### Without Docker, PostgreSQL, or administrator rights

Nothing needs to be installed on your machine. Create a database with any
managed PostgreSQL host, then put its connection string in `.env`:

```bash
DATABASE_URL="postgresql://user:password@your-host.example.com:5432/tyleros?sslmode=require"
```

`sslmode=require` is a standard PostgreSQL parameter, and most hosted databases
need it. TylerOS is provider-agnostic — no host is referenced anywhere in the
code, so any standard connection string is sufficient. Treat the string as a
credential: it belongs in `.env`, never in a commit.

### Then, either way

```bash
pnpm db:migrate     # create the schema
pnpm db:seed        # optional: realistic sample data
pnpm check:env      # confirm everything is ready
pnpm dev            # http://localhost:3000
```

`pnpm check:env` is the first thing to run when something is not working. It
checks Node, `DATABASE_URL`, connectivity, migration state and whether the
database has data, and prints the command for whatever is missing.

## Commands

| Command              | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `pnpm dev`           | Development server                                        |
| `pnpm build`         | Production build (needs no database)                      |
| `pnpm start`         | Serve the production build                                |
| `pnpm check`         | The gate: types, lint, context, tests, build. No database |
| `pnpm check:env`     | Is this machine ready to run TylerOS?                     |
| `pnpm check:context` | Are the instruction files and docs still true?            |
| `pnpm test`          | Vitest, once                                              |
| `pnpm test:watch`    | Vitest, watching                                          |
| `pnpm test:e2e`      | Playwright smoke tests. Needs a real database             |
| `pnpm typecheck`     | Route typegen, then `tsc --noEmit`                        |
| `pnpm lint`          | ESLint, including the architectural layering rules        |
| `pnpm format`        | Prettier                                                  |
| `pnpm db:generate`   | Generate a migration from schema changes                  |
| `pnpm db:migrate`    | Apply pending migrations                                  |
| `pnpm db:studio`     | Drizzle Studio                                            |
| `pnpm db:seed`       | Seed sample data                                          |

## Tests

```bash
pnpm test
```

No database, no network, no setup. Domain tests are pure functions. Integration
tests boot PostgreSQL in-process via PGlite (real PostgreSQL compiled to
WebAssembly), apply the committed migrations from scratch, and exercise the real
SQL — including full-text search and the generated search vector.

Browser smoke tests are separate and need a real database:

```bash
pnpm test:e2e
```

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for what they cover and the
manual checklist used to close a milestone.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, domain boundaries, where new code goes
- [docs/DECISIONS.md](docs/DECISIONS.md) — why the significant choices were made
- [docs/ROADMAP.md](docs/ROADMAP.md) — what comes next, and what deliberately does not
- [docs/VERIFICATION.md](docs/VERIFICATION.md) — how a milestone gets proven
- [CLAUDE.md](CLAUDE.md) — instructions for coding agents, plus `.claude/rules/`

## What this is not

No authentication, no multi-tenancy, no AI. All three are deliberate for 0.1 and
explained in `docs/DECISIONS.md`. TylerOS is designed to be useful before it is
intelligent.
