import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/shared/errors";
import {
  DEFAULT_CATCH_UP_UNTIL_LOCAL_TIME,
  DEFAULT_SCHEDULE_LOCAL_TIME,
  DEFAULT_SCHEDULE_TIMEZONE,
  MILES_WEEKDAY_MORNING_BRIEFING_KEY,
  type Schedule,
} from "./schedule";
import { evaluateSchedule, parseLocalMinutes, zonedCivilTime } from "./schedule-rules";

const MONDAY_BEFORE = new Date("2026-09-07T13:19:00.000Z"); // 06:19 Phoenix
const MONDAY_DUE = new Date("2026-09-07T13:20:00.000Z"); // 06:20 Phoenix
const MONDAY_CATCH_UP = new Date("2026-09-07T18:43:00.000Z"); // 11:43 Phoenix
const MONDAY_NOON = new Date("2026-09-07T19:00:00.000Z"); // 12:00 Phoenix
const SATURDAY_DUE_CLOCK = new Date("2026-09-05T13:20:00.000Z"); // 06:20 Phoenix Saturday

function milesMorning(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "schedule-1",
    key: MILES_WEEKDAY_MORNING_BRIEFING_KEY,
    jobKind: "today_briefing",
    assignedRole: "miles",
    authorization: "observe",
    requestedRuntimeKind: null,
    enabled: true,
    localTime: DEFAULT_SCHEDULE_LOCAL_TIME,
    timezone: DEFAULT_SCHEDULE_TIMEZONE,
    weekdaysOnly: true,
    catchUpUntilLocalTime: DEFAULT_CATCH_UP_UNTIL_LOCAL_TIME,
    createdAt: MONDAY_DUE,
    updatedAt: MONDAY_DUE,
    ...overrides,
  };
}

describe("zonedCivilTime", () => {
  it("reads America/Phoenix civil time, not the host zone", () => {
    expect(zonedCivilTime(MONDAY_DUE, "America/Phoenix")).toEqual({
      date: "2026-09-07",
      minutes: 6 * 60 + 20,
      weekday: 1,
    });
  });

  it("rejects an unknown IANA name", () => {
    expect(() => zonedCivilTime(MONDAY_DUE, "Not/AZone")).toThrow(DomainError);
  });
});

describe("evaluateSchedule", () => {
  const schedule = milesMorning();

  it("does not enqueue before 06:20 Phoenix", () => {
    expect(evaluateSchedule(schedule, MONDAY_BEFORE)).toEqual({
      due: false,
      reason: "before_window",
    });
  });

  it("enqueues at 06:20 Phoenix on a weekday", () => {
    expect(evaluateSchedule(schedule, MONDAY_DUE)).toEqual({
      due: true,
      scheduledForDate: "2026-09-07",
    });
  });

  it("catches up later that morning", () => {
    expect(evaluateSchedule(schedule, MONDAY_CATCH_UP)).toEqual({
      due: true,
      scheduledForDate: "2026-09-07",
    });
  });

  it("does not manufacture a missed briefing at noon", () => {
    expect(evaluateSchedule(schedule, MONDAY_NOON)).toEqual({
      due: false,
      reason: "after_catch_up",
    });
  });

  it("skips weekends even at 06:20", () => {
    expect(evaluateSchedule(schedule, SATURDAY_DUE_CLOCK)).toEqual({
      due: false,
      reason: "weekend",
    });
  });

  it("skips a disabled row", () => {
    expect(evaluateSchedule(milesMorning({ enabled: false }), MONDAY_DUE)).toEqual({
      due: false,
      reason: "disabled",
    });
  });
});

describe("parseLocalMinutes", () => {
  it("accepts HH:MM and HH:MM:SS", () => {
    expect(parseLocalMinutes("06:20")).toBe(380);
    expect(parseLocalMinutes("12:00:00")).toBe(720);
  });
});
