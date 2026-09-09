import {
  consumptionDay,
  consumptionFeedback,
  consumptionPatch,
  type consumptionInputSchema,
  type consumptionActionSchema,
} from "@/domain/consumption/consumption";
import type { z } from "zod";
import type { Database } from "@/server/db/client";
import { NotFoundError } from "@/domain/shared/errors";
import * as repo from "./consumption-repository";
/** Personal day is explicit rather than the hosting region's UTC midnight. */
export function consumptionTimeZone() {
  return process.env.TYLEROS_TIME_ZONE ?? "America/Phoenix";
}
export async function logConsumption(
  db: Database,
  input: z.infer<typeof consumptionInputSchema>,
  now = new Date(),
) {
  return repo.insertConsumption(db, {
    ...input,
    occurredAt: now,
    loggedOn: consumptionDay(now, consumptionTimeZone()),
  });
}
export async function getConsumptionSummary(db: Database, now = new Date()) {
  const timeZone = consumptionTimeZone(),
    day = consumptionDay(now, timeZone);
  return { day, timeZone, ...(await repo.consumptionCounts(db, day)) };
}
export async function getConsumptionHistory(db: Database, now = new Date()) {
  const [entries, today] = await Promise.all([
    repo.recentConsumption(db),
    getConsumptionSummary(db, now),
  ]);
  return { entries, today, feedback: consumptionFeedback(entries) };
}
export async function changeConsumption(
  db: Database,
  id: string,
  action: z.infer<typeof consumptionActionSchema>,
  now = new Date(),
) {
  const row = await repo.patchConsumption(db, id, consumptionPatch(action, now));
  if (!row) throw new NotFoundError("Consumption entry", id);
  return row;
}
