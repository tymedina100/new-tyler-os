# TylerOS

A private personal-life operating system: one place to capture, organise and
retrieve information across a life. Single user, self-hosted, no accounts.

**Current state: Milestone 0.7 — Daily Access Foundation.** Capture, triage,
recurrence, kitchen inventory, universal search, and optional AI-assisted
capture suggestions — now behind one passphrase, installable to a phone's home
screen, and reachable from a bottom bar built for a thumb rather than a mouse.

## What it does today

| Screen       | Purpose                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| **Today**    | Overdue, due today, needs triage, next 7 days. Every item in exactly one place |
| **Upcoming** | The fortnight ahead, one day at a time: work, repeats and best-by dates        |
| **Inbox**    | Everything captured but not yet decided about                                  |
| **Tasks**    | The working list. Defaults to open tasks; browses any type and status          |
| **Projects** | Collections of related work, with progress                                     |
| **Notes**    | Durable knowledge. Not a task; nothing here can be Done                        |
| **Kitchen**  | What food is in the house, and the shopping list                               |
| **Search**   | One query across items, projects, notes and the kitchen, grouped by domain     |
| **Runs**     | Jobs a role was asked to do, and proposals waiting on you                      |

A capture bar sits on every screen. Press `c` to focus it (or tap "Capture" in
the phone bar), `Cmd/Ctrl+K` for the command palette. Inline `#tags`,
`@projects`, dates and repeats in captured text are parsed out automatically, so
"pay the electric bill friday #home" files itself.

On a phone, the bottom bar carries the four things asked for most — Today,
Inbox, capture, Search — and a **More** button opens the rest in a sheet. The
sidebar on a wider screen shows every destination at once.

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

## Access

TylerOS is single-user, and since 0.7 it can be reached from anywhere, not
only from the machine it runs on. One passphrase guards it — see
[docs/DECISIONS.md](docs/DECISIONS.md) ADR 030 for the reasoning and the
threat model.

**In development,** with neither variable below set, TylerOS is open — every
screen loads with no sign-in step, and the server console says so once.
That is the default, and it is fine for working on `localhost`.

**Everywhere else,** set both:

```bash
SESSION_SECRET="$(openssl rand -base64 32)"   # at least 32 characters
AUTH_PASSPHRASE="choose something you can type on a phone"  # at least 16
```

A weak or missing value outside development is a hard failure: the server
starts, logs the problem once, and every screen except `/login` and the
installable icons answers `503` until it is fixed. `next build` itself never
needs these — only the running server does.

Sign in once from `/login`; the session is a signed cookie that renews itself
for up to 30 days of use. Sign out from the sidebar (desktop) or the **More**
sheet (phone).

There is no password reset flow, because there is no account to reset —
losing the passphrase means editing `AUTH_PASSPHRASE` and restarting the
server. There is also no built-in rate limiting on sign-in attempts; if
TylerOS is reachable from the open internet, put that at the platform level
(Vercel's own abuse protection, or a WAF rule in front of it), not in the
application.

## Deploying

TylerOS has no hosting-provider code in it — `DATABASE_URL` over a standard
PostgreSQL connection string is the entire integration surface, and that has
not changed. The one thing 0.7 adds is that `AUTH_PASSPHRASE` and
`SESSION_SECRET` must be set wherever the app actually runs; see
[Access](#access) above.

**Vercel** is the documented path, because it is a verified adapter for this
Next.js version and this project's own development database (Neon) is
already reached the same way in production as in development — a connection
string, nothing Vercel-specific. What is platform-specific either way:

- The two environment variables above, plus `DATABASE_URL`, set on whichever
  host runs the app
- `NEXT_TELEMETRY_DISABLED=1`, carried over from `.env.example`

Nothing else is. `next build && next start` on any Node.js host works
identically; see the [`next build`/self-hosting
guide](https://nextjs.org/docs/app/getting-started/deploying) for other
options. `ANTHROPIC_API_KEY` stays optional everywhere: absent, TylerOS works
exactly as it does in this repository today.

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

## Runtime worker

A separate Python poller (`tyleros_worker.py` in the assistant repository) can
act as Miles: it claims a Today briefing job, reads titles and dates, and
proposes a note. It never writes notes itself. Set `RUNTIME_TOKEN` here
(`openssl rand -base64 32`), apply migrations, then point that worker at this
app with the same token.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, domain boundaries, where new code goes
- [docs/DECISIONS.md](docs/DECISIONS.md) — why the significant choices were made
- [docs/ROADMAP.md](docs/ROADMAP.md) — what comes next, and what deliberately does not
- [docs/VERIFICATION.md](docs/VERIFICATION.md) — how a milestone gets proven
- [CLAUDE.md](CLAUDE.md) — instructions for coding agents, plus `.claude/rules/`

## What this is not

No multiple users, no accounts, no multi-user roles, no OAuth or provider-based
auth library — one person, one passphrase (ADR 030). Org roles such as Miles
are TylerOS staff identities, not login accounts (ADR 035). No AI dependence:
every feature works with `ANTHROPIC_API_KEY` unset, which is how this repository
ships. No offline mode — installable, not offline (ADR 031). All deliberate,
and explained in `docs/DECISIONS.md`. TylerOS is designed to be useful before
it is intelligent.
