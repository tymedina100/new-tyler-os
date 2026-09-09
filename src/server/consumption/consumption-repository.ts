import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { consumptionEntries } from "@/server/db/schema";
export async function insertConsumption(
  db: Database,
  input: { kind: "food" | "drink"; description: string; occurredAt: Date; loggedOn: string },
) {
  const [row] = await db.insert(consumptionEntries).values(input).returning();
  return row!;
}
export async function recentConsumption(db: Database) {
  return db
    .select()
    .from(consumptionEntries)
    .orderBy(desc(consumptionEntries.occurredAt), desc(consumptionEntries.id))
    .limit(100);
}
export async function consumptionCounts(db: Database, day: string) {
  const [row] = await db
    .select({
      food: sql<number>`count(*) filter (where ${consumptionEntries.kind}='food')::int`,
      drink: sql<number>`count(*) filter (where ${consumptionEntries.kind}='drink')::int`,
    })
    .from(consumptionEntries)
    .where(and(eq(consumptionEntries.loggedOn, day), isNull(consumptionEntries.voidedAt)));
  return row!;
}
export async function patchConsumption(
  db: Database,
  id: string,
  patch: { feedback?: "like" | "dislike" | null; voidedAt?: Date | null },
) {
  const [row] = await db
    .update(consumptionEntries)
    .set(patch)
    .where(eq(consumptionEntries.id, id))
    .returning();
  return row;
}
