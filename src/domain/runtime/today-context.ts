import type { KitchenLocation } from "@/domain/kitchen/inventory";
import type { IsoDate } from "@/domain/shared/date";

/**
 * What a runtime may read about Today.
 *
 * Titles and dates only. Item bodies, kitchen notes, and project names stay
 * off this DTO — observe means enough to brief, not a dump of personal prose.
 */

export interface TodayContextItem {
  id: string;
  title: string;
  dueOn: IsoDate | null;
}

export interface TodayContextFood {
  id: string;
  name: string;
  location: KitchenLocation;
  expiresOn: IsoDate | null;
}

export interface TodayContext {
  today: IsoDate;
  overdue: TodayContextItem[];
  dueToday: TodayContextItem[];
  upcoming: TodayContextItem[];
  needsTriage: TodayContextItem[];
  expiringSoon: TodayContextFood[];
}
