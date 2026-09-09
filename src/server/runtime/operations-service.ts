import type { OperationsSummary } from "@/domain/runtime/operations-summary";
import type { Database } from "@/server/db/client";
import { readOperationCounts } from "./operations-repository";

/** Rolling 24 hours for outcomes; all still-pending decisions, regardless of age. */
export async function getOperationsSummary(
  db: Database,
  now = new Date(),
): Promise<OperationsSummary> {
  const since = new Date(now.getTime() - 86_400_000);
  return {
    since: since.toISOString(),
    asOf: now.toISOString(),
    ...(await readOperationCounts(db, since, now)),
  };
}
