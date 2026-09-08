import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "@/server/db/client";
import * as schema from "@/server/db/schema";

/**
 * An in-process Postgres for integration tests.
 *
 * PGlite is real Postgres compiled to WebAssembly, so `tsvector`, generated
 * columns, `filter (where ...)` and transactions all behave exactly as they will
 * in production. No Docker, no running server, no shared state between runs -
 * which is what stops integration tests from quietly rotting into "skipped".
 *
 * Migrations are applied from ./drizzle, so every test run also proves that the
 * committed migration files still work from scratch.
 */

export interface TestDatabase {
  db: Database;
  truncate(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: "drizzle" });

  return {
    db,
    async truncate() {
      await client.exec(
        `truncate table "item_tags", "item_recurrence", "item_suggestions", "items", "note_tags", "notes", "tags", "projects", "kitchen_inventory", "approvals", "standing_authorities", "usage_entries", "runs", "jobs", "ai_execution_profiles", "runtime_credentials", "runtime_capabilities", "runtime_role_grants", "capacity_updates", "capacity_pools", "runtimes" cascade;`,
      );
    },
    async close() {
      await client.close();
    },
  };
}
