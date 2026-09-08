import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { Database } from "@/server/db/client";
import * as schema from "@/server/db/schema";

/**
 * Two postgres.js connections to a throwaway database. Used to race
 * overlapping transactions; PGlite's single-backend queue cannot do that.
 */

export interface PostgresRaceHarness {
  dbA: Database;
  dbB: Database;
  close(): Promise<void>;
}

export async function openPostgresRaceHarness(): Promise<PostgresRaceHarness | null> {
  const adminUrl = raceAdminUrl();
  if (!adminUrl) return null;

  const name = `tyleros_race_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const admin = postgres(adminUrl, { max: 1, connect_timeout: 3, idle_timeout: 2 });
  try {
    await admin`SELECT 1`;
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } catch {
    await admin.end({ timeout: 1 });
    return null;
  }
  await admin.end({ timeout: 1 });

  const raceUrl = withDatabaseName(adminUrl, name);
  const sqlA = postgres(raceUrl, { max: 1, connect_timeout: 8 });
  const sqlB = postgres(raceUrl, { max: 1, connect_timeout: 8 });
  const dbA = drizzle(sqlA, { schema });
  const dbB = drizzle(sqlB, { schema });

  try {
    await migrate(dbA, { migrationsFolder: "drizzle" });
  } catch (error) {
    await sqlA.end({ timeout: 1 });
    await sqlB.end({ timeout: 1 });
    await dropDatabase(adminUrl, name);
    throw error;
  }

  return {
    dbA,
    dbB,
    async close() {
      await sqlA.end({ timeout: 1 });
      await sqlB.end({ timeout: 1 });
      await dropDatabase(adminUrl, name);
    },
  };
}

function raceAdminUrl(): string | null {
  return process.env.TYLEROS_RACE_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
}

function withDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

async function dropDatabase(adminUrl: string, name: string): Promise<void> {
  const admin = postgres(adminUrl, { max: 1, connect_timeout: 3, idle_timeout: 2 });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await admin.end({ timeout: 1 });
  }
}
