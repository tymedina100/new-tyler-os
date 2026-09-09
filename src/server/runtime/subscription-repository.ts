import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { subscriptionRequests } from "@/server/db/schema";
export async function findSubscriptionRequest(db: Database, runId: string) {
  const [row] = await db
    .select()
    .from(subscriptionRequests)
    .where(eq(subscriptionRequests.runId, runId));
  return row ?? null;
}
export async function insertSubscriptionRequest(
  db: Database,
  data: typeof subscriptionRequests.$inferInsert,
) {
  const [row] = await db.insert(subscriptionRequests).values(data).returning();
  return row!;
}
