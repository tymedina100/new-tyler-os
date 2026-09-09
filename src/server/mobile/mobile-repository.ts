import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { mobileLoginLimits, mobileMutationReceipts, mobileSessions } from "@/server/db/schema";

export async function insertSession(
  db: Database,
  tokenHash: string,
  configHash: string,
  expiresAt: Date,
) {
  await db.insert(mobileSessions).values({ tokenHash, configHash, expiresAt });
}
export async function hasSession(db: Database, tokenHash: string, configHash: string, now: Date) {
  const rows = await db
    .select({ tokenHash: mobileSessions.tokenHash })
    .from(mobileSessions)
    .where(
      and(
        eq(mobileSessions.tokenHash, tokenHash),
        eq(mobileSessions.configHash, configHash),
        gt(mobileSessions.expiresAt, now),
      ),
    );
  return rows.length === 1;
}
export async function revokeSession(db: Database, tokenHash: string) {
  await db.delete(mobileSessions).where(eq(mobileSessions.tokenHash, tokenHash));
}
/** One global budget cannot be bypassed with forged client IP headers. */
export async function takeLoginAttempt(db: Database, now: Date) {
  const cutoff = new Date(now.getTime() - 15 * 60_000).toISOString();
  const [row] = await db
    .insert(mobileLoginLimits)
    .values({ key: "mobile", windowStart: now, attempts: 1 })
    .onConflictDoUpdate({
      target: mobileLoginLimits.key,
      set: {
        windowStart: sql`case when ${mobileLoginLimits.windowStart} <= ${cutoff} then ${now.toISOString()}::timestamptz else ${mobileLoginLimits.windowStart} end`,
        attempts: sql`case when ${mobileLoginLimits.windowStart} <= ${cutoff} then 1 else ${mobileLoginLimits.attempts} + 1 end`,
      },
    })
    .returning();
  return row!.attempts <= 20;
}
export async function reserveMutation(db: Database, requestId: string, payloadHash: string) {
  // Conflict waits for the owning transaction; its result becomes visible before replay.
  const inserted = await db
    .insert(mobileMutationReceipts)
    .values({ requestId, payloadHash })
    .onConflictDoNothing()
    .returning({ requestId: mobileMutationReceipts.requestId });
  return inserted.length === 1;
}
export async function getReceipt(db: Database, requestId: string) {
  const [row] = await db
    .select()
    .from(mobileMutationReceipts)
    .where(eq(mobileMutationReceipts.requestId, requestId));
  return row;
}
export async function finishMutation(db: Database, requestId: string, response: unknown) {
  await db
    .update(mobileMutationReceipts)
    .set({ response })
    .where(eq(mobileMutationReceipts.requestId, requestId));
}
