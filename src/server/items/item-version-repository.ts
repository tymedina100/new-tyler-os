import { eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { items } from "@/server/db/schema";

export async function lockItem(db: Database, id: string) {
  const [row] = await db
    .select({ updatedAt: items.updatedAt })
    .from(items)
    .where(eq(items.id, id))
    .for("update");
  return row;
}

/** Preserve a distinct version even when two edits happen within one millisecond. */
export async function advanceItemVersion(db: Database, id: string, previous: Date) {
  const minimum = new Date(previous.getTime() + 1).toISOString();
  await db
    .update(items)
    .set({ updatedAt: sql`greatest(${items.updatedAt}, ${minimum}::timestamptz)` })
    .where(eq(items.id, id));
}
