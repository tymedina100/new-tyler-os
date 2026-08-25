import "dotenv/config";
import postgres from "postgres";

/**
 * Refuses to start the smoke suite unless the database is actually ready.
 *
 * Without this, a missing DATABASE_URL surfaces as a browser timing out on a
 * 500 page, which reads like a broken application rather than a missing
 * prerequisite. Failing here, with the command to run, is the difference
 * between a useful suite and one that gets disabled.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "The smoke suite needs a database.\n\n" +
        "  DATABASE_URL is not set. Copy .env.example to .env and point it at any\n" +
        "  PostgreSQL — local (docker compose up -d) or remote.\n\n" +
        "  Then: pnpm db:migrate && pnpm db:seed && pnpm check:env\n\n" +
        "  The database-independent suite still runs: pnpm test",
    );
  }

  const sql = postgres(url, { max: 1, connect_timeout: 8, idle_timeout: 1 });

  try {
    const [row] = await sql<{ items: number }[]>`select count(*)::int as items from items`;

    if ((row?.items ?? 0) === 0) {
      throw new Error(
        "The database is reachable but empty.\n\n" +
          "  The smoke suite reads seeded content. Run: pnpm db:seed",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The database is reachable"))
      throw error;

    throw new Error(
      `Could not query the database: ${error instanceof Error ? error.message : String(error)}\n\n` +
        "  Diagnose it with: pnpm check:env",
    );
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}
