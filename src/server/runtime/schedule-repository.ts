import { eq } from "drizzle-orm";
import type { Schedule } from "@/domain/runtime/schedule";
import type { Database } from "@/server/db/client";
import { schedules } from "@/server/db/schema";
import { toSchedule } from "./runtime-rows";

export async function listEnabledSchedules(db: Database): Promise<Schedule[]> {
  const rows = await db.select().from(schedules).where(eq(schedules.enabled, true));
  return rows.map(toSchedule);
}

export async function findScheduleByKey(db: Database, key: string): Promise<Schedule | null> {
  const [row] = await db.select().from(schedules).where(eq(schedules.key, key)).limit(1);
  return row ? toSchedule(row) : null;
}
