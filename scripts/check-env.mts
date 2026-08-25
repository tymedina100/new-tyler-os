import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

/**
 * Is this machine ready to run TylerOS?
 *
 * TylerOS needs a reachable PostgreSQL, and there are two supported ways to have
 * one: a local server (see docker-compose.yml) or a remote one reached through a
 * standard connection string. This script does not care which — it reports what
 * is missing and what to run next.
 *
 * Named `check:env` rather than `doctor` because `pnpm doctor` is a built-in
 * pnpm command and would shadow a script of that name.
 */

type Level = "ok" | "warn" | "fail";

interface Check {
  label: string;
  level: Level;
  detail: string;
  fix?: string;
}

const checks: Check[] = [];

function record(label: string, level: Level, detail: string, fix?: string): void {
  checks.push(fix === undefined ? { label, level, detail } : { label, level, detail, fix });
}

/** Redacts the password so output can be pasted into an issue safely. */
function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "<unparseable>";
  }
}

// ---------------------------------------------------------------- toolchain

const required = readEnginesRange();
const runningMajorMinor = process.versions.node.split(".").slice(0, 2).map(Number);

if (required && !satisfies(runningMajorMinor, required)) {
  record(
    "Node.js",
    "fail",
    `${process.versions.node} — this project needs >=${required.join(".")}`,
    "Install a newer Node (nvm, fnm, or the official installer). No admin rights needed for nvm/fnm.",
  );
} else {
  record("Node.js", "ok", process.versions.node);
}

const pnpmVersion = process.env.npm_config_user_agent?.match(/pnpm\/(\S+)/)?.[1];
record(
  "pnpm",
  pnpmVersion ? "ok" : "warn",
  pnpmVersion ?? "not detected (run this through `pnpm check:env`)",
);

// -------------------------------------------------------------- environment

if (existsSync(".env")) {
  record("Local .env", "ok", "present");
} else {
  record(
    "Local .env",
    "warn",
    "not found — relying on the ambient environment",
    "cp .env.example .env, then set DATABASE_URL",
  );
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  record(
    "DATABASE_URL",
    "fail",
    "not set",
    "Set it in .env. Either a local server (docker compose up -d) or any remote PostgreSQL connection string.",
  );
} else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
  record(
    "DATABASE_URL",
    "fail",
    "does not look like a PostgreSQL connection string",
    "Expected postgresql://user:password@host:port/database",
  );
} else {
  record("DATABASE_URL", "ok", safeUrl(databaseUrl));
}

// --------------------------------------------------------------- connectivity

if (databaseUrl && /^postgres(ql)?:\/\//.test(databaseUrl)) {
  await checkDatabase(databaseUrl);
}

report();

// ------------------------------------------------------------------ helpers

async function checkDatabase(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 1 });

  try {
    const [row] = await sql<{ version: string }[]>`select version() as version`;
    record("Connection", "ok", row?.version.split(",")[0] ?? "connected");
  } catch (error) {
    describeConnectionFailure(error);
    await sql.end({ timeout: 1 }).catch(() => undefined);
    return;
  }

  await checkMigrations(sql);
  await checkSeed(sql);
  await sql.end({ timeout: 2 }).catch(() => undefined);
}

function describeConnectionFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const code = extractCode(error);

  if (code === "ECONNREFUSED") {
    record(
      "Connection",
      "fail",
      "refused — nothing is listening there",
      "Local: `docker compose up -d`. No Docker or admin rights? Point DATABASE_URL at a remote PostgreSQL instead (see README).",
    );
    return;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    record("Connection", "fail", `host could not be resolved (${code})`, "Check the hostname.");
    return;
  }
  if (code === "ECONNRESET" || code === "EPIPE") {
    record(
      "Connection",
      "fail",
      `the connection was closed by the other end (${code})`,
      "Something is on that port but it is not answering as PostgreSQL. Check the port, " +
        "whether the server is still starting, and whether TLS is required (?sslmode=require).",
    );
    return;
  }
  if (code === "ETIMEDOUT" || code === "CONNECT_TIMEOUT") {
    record(
      "Connection",
      "fail",
      "timed out",
      "For a remote database, check the host, the port, and whether your network or the " +
        "provider's firewall allows the connection.",
    );
    return;
  }
  if (code === "28P01" || /password authentication/i.test(message)) {
    record("Connection", "fail", "authentication failed", "Check the user and password.");
    return;
  }
  if (code === "3D000") {
    record(
      "Connection",
      "fail",
      "the database in the URL does not exist",
      "Create it, or correct the database name.",
    );
    return;
  }
  if (/ssl|SELF_SIGNED|certificate/i.test(message)) {
    record(
      "Connection",
      "fail",
      `TLS was rejected: ${message}`,
      "Most hosted PostgreSQL requires TLS. Append ?sslmode=require to DATABASE_URL.",
    );
    return;
  }

  record("Connection", "fail", message);
}

/**
 * Compares the committed migration journal with what the database has applied,
 * which is the difference between "the app will start" and "the app will crash
 * on its first query".
 */
async function checkMigrations(sql: postgres.Sql): Promise<void> {
  const journalPath = "drizzle/meta/_journal.json";

  if (!existsSync(journalPath)) {
    record("Migrations", "warn", "no migration journal found in drizzle/meta");
    return;
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries?: unknown[] };
  const expected = journal.entries?.length ?? 0;

  let applied: number;
  try {
    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from drizzle.__drizzle_migrations
    `;
    applied = rows[0]?.count ?? 0;
  } catch {
    record(
      "Migrations",
      "fail",
      `0 of ${expected} applied — the schema is not there yet`,
      "pnpm db:migrate",
    );
    return;
  }

  if (applied < expected) {
    record("Migrations", "fail", `${applied} of ${expected} applied`, "pnpm db:migrate");
  } else if (applied > expected) {
    record(
      "Migrations",
      "warn",
      `${applied} applied but only ${expected} committed — this database is ahead of the repository`,
      "Pull the branch that generated them, or use a different database.",
    );
  } else {
    record("Migrations", "ok", `${applied} of ${expected} applied`);
  }
}

async function checkSeed(sql: postgres.Sql): Promise<void> {
  try {
    const rows = await sql<{ items: number; projects: number }[]>`
      select
        (select count(*)::int from items) as items,
        (select count(*)::int from projects) as projects
    `;
    const items = rows[0]?.items ?? 0;
    const projects = rows[0]?.projects ?? 0;

    if (items === 0) {
      record("Data", "warn", "no items yet", "pnpm db:seed for realistic sample data");
    } else {
      record("Data", "ok", `${items} items, ${projects} projects`);
    }
  } catch {
    // Tables missing is already reported by the migration check.
  }
}

function readEnginesRange(): number[] | null {
  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      engines?: { node?: string };
    };
    const parts = pkg.engines?.node
      ?.replace(/[^0-9.]/g, "")
      .split(".")
      .map(Number);
    return parts && parts.length > 0 && !Number.isNaN(parts[0]) ? parts.slice(0, 2) : null;
  } catch {
    return null;
  }
}

function satisfies(running: number[], minimum: number[]): boolean {
  const [major = 0, minor = 0] = running;
  const [minMajor = 0, minMinor = 0] = minimum;
  return major > minMajor || (major === minMajor && minor >= minMinor);
}

function extractCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function report(): void {
  const symbol: Record<Level, string> = { ok: "✔", warn: "!", fail: "✖" };
  const width = Math.max(...checks.map((check) => check.label.length));

  console.warn("\nTylerOS readiness\n");
  for (const check of checks) {
    console.warn(`  ${symbol[check.level]} ${check.label.padEnd(width)}  ${check.detail}`);
    if (check.fix) console.warn(`    ${" ".repeat(width)}  → ${check.fix}`);
  }

  const failed = checks.filter((check) => check.level === "fail");

  if (failed.length === 0) {
    console.warn("\nReady. `pnpm dev` will work, and so will `pnpm test:e2e`.\n");
    process.exit(0);
  }

  console.warn(
    `\n${failed.length} blocking problem(s). TylerOS will not run until they are fixed.`,
  );
  console.warn("Tests do not need a database: `pnpm test` works regardless.\n");
  process.exit(1);
}
