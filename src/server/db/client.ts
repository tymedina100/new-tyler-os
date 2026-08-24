import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/server/env";
import * as schema from "./schema";

/**
 * The database handle.
 *
 * `Database` is deliberately driver-agnostic. Application code runs against
 * postgres.js; tests run against an in-process PGlite instance. Repositories
 * take a `Database` as their first argument rather than reaching for a
 * singleton, which is the whole reason they are testable without Docker.
 *
 * A transaction handle satisfies this type too, so services can pass `tx`
 * straight through to repository functions.
 */
export type Database = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

type DatabaseGlobal = {
  tylerOsDb?: PostgresJsDatabase<typeof schema>;
  tylerOsSql?: postgres.Sql;
};

// Next.js hot-reloads modules in development; without this the dev server opens
// a new connection pool on every edit until Postgres refuses them.
const globalForDb = globalThis as unknown as DatabaseGlobal;

export function getDb(): Database {
  if (!globalForDb.tylerOsDb) {
    const client = postgres(serverEnv().DATABASE_URL, { max: 10 });
    globalForDb.tylerOsSql = client;
    globalForDb.tylerOsDb = drizzle(client, { schema });
  }

  return globalForDb.tylerOsDb;
}
