import { DomainError } from "@/domain/shared/errors";
import type { IsoDate } from "@/domain/shared/date";
import type { Schedule, ScheduleDue, ZonedCivilTime } from "./schedule";

/**
 * When a schedule should create a job.
 *
 * Time is always the schedule's IANA zone. The host clock and the Python
 * worker's clock do not decide due-ness — they only wake TylerOS so this
 * function can run. Weekends and the noon catch-up cutoff are evaluated
 * against that zone, not UTC.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function evaluateSchedule(schedule: Schedule, now: Date): ScheduleDue {
  if (!schedule.enabled) return { due: false, reason: "disabled" };

  const civil = zonedCivilTime(now, schedule.timezone);
  if (schedule.weekdaysOnly && (civil.weekday === 0 || civil.weekday === 6)) {
    return { due: false, reason: "weekend" };
  }

  const dueMinutes = parseLocalMinutes(schedule.localTime);
  const catchUpMinutes = parseLocalMinutes(schedule.catchUpUntilLocalTime);

  if (civil.minutes < dueMinutes) return { due: false, reason: "before_window" };
  if (civil.minutes >= catchUpMinutes) return { due: false, reason: "after_catch_up" };

  return { due: true, scheduledForDate: civil.date };
}

export function zonedCivilTime(now: Date, timeZone: string): ZonedCivilTime {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
  } catch {
    throw new DomainError("conflict", `Unknown timezone: ${timeZone}`);
  }

  const weekdayName = part(parts, "weekday");
  const weekday = WEEKDAY_INDEX[weekdayName];
  if (weekday === undefined) {
    throw new DomainError("conflict", `Could not read weekday in ${timeZone}.`);
  }

  const year = part(parts, "year");
  const month = part(parts, "month");
  const day = part(parts, "day");
  const date: IsoDate = `${year}-${month}-${day}`;
  const hour = Number(part(parts, "hour"));
  const minute = Number(part(parts, "minute"));

  return { date, minutes: hour * 60 + minute, weekday };
}

/** Accepts `HH:MM` or `HH:MM:SS`. */
export function parseLocalMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) {
    throw new DomainError("conflict", `Expected a local time like 06:20, got "${value}".`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new DomainError("conflict", `Invalid local time "${value}".`);
  }

  return hours * 60 + minutes;
}

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  const value = parts.find((entry) => entry.type === type)?.value;
  if (!value) throw new DomainError("conflict", `Missing ${type} in zoned time.`);
  return value;
}
