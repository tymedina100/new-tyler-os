import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync, statSync } from "node:fs";

/**
 * Validates the instruction system itself.
 *
 * CLAUDE.md, .claude/rules/ and docs/ are how a fresh session learns this
 * repository, and nothing else notices when they stop being true. This catches
 * the failure modes that are silent:
 *
 *   - a rule whose `paths:` glob matches nothing, so it never loads and nobody
 *     finds out
 *   - a documented `pnpm` command that no longer exists
 *   - a reference to a file that has moved
 *   - CLAUDE.md quietly growing past the size where adherence drops
 *   - a credential reaching a tracked file
 *
 * Runs in `pnpm check`. Needs no database and no network.
 */

const CLAUDE_MD_MAX_LINES = 200;

/** Only repo-rooted references are validated; anything else is prose. */
const ROOTED_PREFIXES = [
  "src/",
  "tests/",
  "e2e/",
  "docs/",
  "drizzle/",
  "scripts/",
  ".claude/",
  "public/",
];

const ROOT_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "CLAUDE.md",
  "AGENTS.md",
  "README.md",
  "docker-compose.yml",
  "drizzle.config.ts",
  "eslint.config.mjs",
  "next.config.ts",
  "vitest.config.mts",
  "playwright.config.ts",
  ".env.example",
  ".gitignore",
]);

/** pnpm's own verbs, which are not project scripts. */
const PNPM_BUILTINS = new Set([
  "install",
  "add",
  "remove",
  "update",
  "exec",
  "dlx",
  "why",
  "doctor",
  "approve-builds",
  "store",
  "run",
  "list",
  "outdated",
]);

const errors: string[] = [];
const warnings: string[] = [];

function fail(message: string): void {
  errors.push(message);
}

function warn(message: string): void {
  warnings.push(message);
}

const instructionFiles = [
  "CLAUDE.md",
  "README.md",
  ...globSync("docs/**/*.md"),
  ...globSync(".claude/rules/**/*.md"),
];

const scripts = Object.keys(
  (JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> })
    .scripts ?? {},
);

checkClaudeMdSize();
checkRules();
for (const file of instructionFiles) {
  const content = readFileSync(file, "utf8");
  checkReferences(file, content);
  checkCommands(file, content);
  checkAdrReferences(file, content);
}
checkNoSecrets();

finish();

// ---------------------------------------------------------------------------

function checkClaudeMdSize(): void {
  const lines = readFileSync("CLAUDE.md", "utf8").split("\n").length;

  if (lines > CLAUDE_MD_MAX_LINES) {
    fail(
      `CLAUDE.md is ${lines} lines (limit ${CLAUDE_MD_MAX_LINES}). ` +
        `Move layer-specific detail into .claude/rules/ so it loads only when relevant.`,
    );
  } else {
    console.warn(`  ✔ CLAUDE.md is ${lines} lines (limit ${CLAUDE_MD_MAX_LINES})`);
  }
}

/**
 * A rule with a glob that matches nothing is worse than no rule: it looks like
 * governance and provides none.
 */
function checkRules(): void {
  const rules = globSync(".claude/rules/**/*.md");

  if (rules.length === 0) {
    warn("No files in .claude/rules/ — layer conventions are back to living in CLAUDE.md.");
    return;
  }

  for (const rule of rules) {
    const content = readFileSync(rule, "utf8");
    const paths = readPathsFrontmatter(content);

    if (paths === null) {
      console.warn(`  ✔ ${rule} (always loaded)`);
      continue;
    }

    if (paths.length === 0) {
      fail(`${rule} has \`paths:\` frontmatter with no patterns.`);
      continue;
    }

    for (const pattern of paths) {
      if (globSync(pattern).length === 0) {
        fail(`${rule}: pattern "${pattern}" matches no files, so this rule never loads.`);
      }
    }

    console.warn(`  ✔ ${rule} (${paths.length} pattern(s), all matching)`);
  }
}

function readPathsFrontmatter(content: string): string[] | null {
  if (!content.startsWith("---")) return null;

  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;

  const block = content.slice(3, end).split("\n");
  const paths: string[] = [];
  let inPaths = false;

  for (const raw of block) {
    const line = raw.trimEnd();
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths) {
      const match = /^\s*-\s*["']?([^"']+)["']?\s*$/.exec(line);
      if (match?.[1]) {
        paths.push(match[1]);
        continue;
      }
      if (line.trim().length > 0) inPaths = false;
    }
  }

  return paths.length > 0 ? paths : null;
}

function checkReferences(file: string, content: string): void {
  const candidates = new Set<string>();

  // Markdown links, skipping URLs and pure anchors.
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (target && !/^(https?:|#|mailto:)/.test(target)) {
      candidates.add(target.split("#")[0] ?? target);
    }
  }

  // Backticked paths, e.g. `docs/ARCHITECTURE.md` or `src/domain/`.
  for (const match of content.matchAll(/`([^`\s]+)`/g)) {
    const value = match[1];
    if (value) candidates.add(value);
  }

  for (const candidate of candidates) {
    // Globs and alias patterns are intentionally not real paths.
    if (candidate.includes("*") || candidate.startsWith("@/")) continue;

    const isRooted =
      ROOTED_PREFIXES.some((prefix) => candidate.startsWith(prefix)) || ROOT_FILES.has(candidate);
    if (!isRooted) continue;

    if (!existsSync(candidate)) {
      fail(`${file} references "${candidate}", which does not exist.`);
    }
  }
}

function checkCommands(file: string, content: string): void {
  for (const match of content.matchAll(/\bpnpm (?:run )?([a-z][a-z0-9:-]*)/g)) {
    const name = match[1];
    if (!name || PNPM_BUILTINS.has(name)) continue;

    if (!scripts.includes(name)) {
      fail(`${file} documents \`pnpm ${name}\`, which is not a script in package.json.`);
    }
  }
}

function checkAdrReferences(file: string, content: string): void {
  const decisions = readFileSync("docs/DECISIONS.md", "utf8");

  for (const match of content.matchAll(/\bADRs? (\d{3})\b/g)) {
    const id = match[1];
    if (id && !decisions.includes(`## ${id} `)) {
      fail(`${file} cites ADR ${id}, which is not in docs/DECISIONS.md.`);
    }
  }
}

function checkNoSecrets(): void {
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  if (tracked.includes(".env")) {
    fail(
      ".env is tracked by git. Remove it from the index; only .env.example belongs in the repo.",
    );
  }

  const skip = new Set(["pnpm-lock.yaml"]);
  const patterns: [RegExp, string][] = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
    [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
    [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "a GitHub token"],
    [/\bsk-[A-Za-z0-9]{32,}\b/, "an API secret key"],
  ];

  for (const file of tracked) {
    if (skip.has(file) || file.startsWith("drizzle/meta/")) continue;
    if (!existsSync(file) || statSync(file).size > 512_000) continue;

    const content = readFileSync(file, "utf8");
    for (const [pattern, description] of patterns) {
      if (pattern.test(content)) fail(`${file} appears to contain ${description}.`);
    }

    for (const match of content.matchAll(/postgres(?:ql)?:\/\/[^\s"'`]+/g)) {
      if (looksLikeLiveCredential(match[0])) {
        fail(`${file} contains a database URL with a real-looking credential: ${match[0]}`);
      }
    }
  }

  console.warn("  ✔ no credentials found in tracked files");
}

/**
 * The committed connection string points at the local development database with
 * a well-known password, which is fine. A password on a remote host is not.
 */
function looksLikeLiveCredential(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (!url.password) return false;

  const localHosts = new Set([
    "localhost",
    "127.0.0.1",
    "::1",
    "postgres",
    "db",
    "host.docker.internal",
  ]);
  const placeholders = new Set(["tyleros", "postgres", "password", "***", "user", "changeme"]);

  return !localHosts.has(url.hostname) && !placeholders.has(url.password.toLowerCase());
}

function finish(): void {
  for (const message of warnings) console.warn(`  ! ${message}`);

  if (errors.length === 0) {
    console.warn(
      `\nContext system valid.${warnings.length > 0 ? ` ${warnings.length} warning(s).` : ""}\n`,
    );
    process.exit(0);
  }

  console.warn("");
  for (const message of errors) console.error(`  ✖ ${message}`);
  console.error(`\n${errors.length} problem(s) in the instruction system.\n`);
  process.exit(1);
}
