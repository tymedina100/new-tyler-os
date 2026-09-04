import type { IsoDate } from "@/domain/shared/date";
import type { AuthorizationLevel, JobKind, Role, RuntimeKind } from "./runtime";

/**
 * Recurring work the control plane owns.
 *
 * A schedule is not an agent and not a runtime. It is infrastructure under
 * the org chart: this row says Miles should get a Today briefing on weekday
 * mornings. Which backend claims it is decided later, the same way a manual
 * job is. See ADR 036.
 */

export const MILES_WEEKDAY_MORNING_BRIEFING_KEY = "miles_weekday_morning_briefing";

export const DEFAULT_SCHEDULE_TIMEZONE = "America/Phoenix";
export const DEFAULT_SCHEDULE_LOCAL_TIME = "06:20";
export const DEFAULT_CATCH_UP_UNTIL_LOCAL_TIME = "12:00";

/** A running observe attempt older than this is recovered on the next tick. */
export const OBSERVE_RUN_LEASE_MS = 2 * 60 * 1000;

/** Observe jobs only. Propose / modify_local / external_action are never auto-retried. */
export const MAX_OBSERVE_ATTEMPTS = 3;

export interface Schedule {
  id: string;
  key: string;
  jobKind: JobKind;
  assignedRole: Role;
  authorization: AuthorizationLevel;
  requestedRuntimeKind: RuntimeKind | null;
  enabled: boolean;
  /** Clock time in the schedule's zone, `HH:MM` or `HH:MM:SS`. */
  localTime: string;
  /** IANA name. The source of truth — not the host's zone, not the worker's. */
  timezone: string;
  weekdaysOnly: boolean;
  /** Inclusive lower bound is `localTime`; this instant is exclusive. */
  catchUpUntilLocalTime: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ZonedCivilTime {
  date: IsoDate;
  /** Minutes from local midnight. */
  minutes: number;
  /** Sunday = 0, matching `Date.getUTCDay()` on the civil date. */
  weekday: number;
}

export type ScheduleDue =
  | { due: true; scheduledForDate: IsoDate }
  | { due: false; reason: "disabled" | "weekend" | "before_window" | "after_catch_up" };
