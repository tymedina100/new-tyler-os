import type { InventoryItem, KitchenLocation } from "@/domain/kitchen/inventory";
import { compareIsoDate, daysBetween, type IsoDate } from "@/domain/shared/date";

/**
 * Pure rules over kitchen inventory.
 *
 * Everything here takes the reference date as an argument, like the rest of the
 * domain. A function that reads the clock cannot be tested in November for what
 * it does in August.
 */

export const EXPIRING_SOON_DAYS = 3;

export type ExpiryState = "expired" | "soon" | "later" | "none";

/**
 * How worried to be about a date.
 *
 * Three days, not seven: a week-long window flags half a fridge, and a warning
 * that is always on is a warning nobody reads. Three days is roughly the horizon
 * over which someone can actually change what they cook.
 */
export function bucketExpiry(expiresOn: IsoDate | null, today: IsoDate): ExpiryState {
  if (expiresOn === null) return "none";
  if (compareIsoDate(expiresOn, today) < 0) return "expired";
  return daysBetween(today, expiresOn) <= EXPIRING_SOON_DAYS ? "soon" : "later";
}

/** Expired or nearly so — the food worth a glance before it is thrown away. */
export function needsUsingSoon(expiresOn: IsoDate | null, today: IsoDate): boolean {
  const state = bucketExpiry(expiresOn, today);
  return state === "expired" || state === "soon";
}

/**
 * How a quantity reads to a person.
 *
 * The three shapes are all legitimate answers to "how much is there?", and the
 * point of allowing all three is that none of them is a lie:
 *
 *   2 + "lb"    -> "2 lb"      measured
 *   8 + null    -> "8"         counted
 *   null        -> "Some"      there is some, nobody counted it
 *   0           -> "Out"       the record is kept, the food is not
 */
export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null) return unit === null ? "Some" : `Some ${unit}`;
  if (quantity === 0) return "Out";

  const amount = formatAmount(quantity);
  return unit === null ? amount : `${amount} ${unit}`;
}

/** Trailing zeroes are noise: 1.30 lb is 1.3 lb, and 2.00 lb is 2 lb. */
function formatAmount(quantity: number): string {
  return String(Number(quantity.toFixed(2)));
}

/**
 * Sorting for a list someone reads standing at an open fridge: whatever is
 * about to go off first, then everything without a date, alphabetically.
 */
export function compareInventoryForDisplay(a: InventoryItem, b: InventoryItem): number {
  if (a.expiresOn !== null && b.expiresOn !== null) {
    const byDate = compareIsoDate(a.expiresOn, b.expiresOn);
    if (byDate !== 0) return byDate;
  } else if (a.expiresOn !== b.expiresOn) {
    return a.expiresOn === null ? 1 : -1;
  }

  return a.name.localeCompare(b.name);
}

/**
 * The text that goes on the shopping list when something runs out.
 *
 * The quantity comes along because "milk" and "2 gal milk" are different
 * shopping lines, and retyping it is exactly the friction that stops an
 * inventory being kept up to date.
 */
export function shoppingTextFor(name: string, unit: string | null): string {
  return unit === null ? name : `${name} (${unit})`;
}

export interface LocationCount {
  location: KitchenLocation;
  count: number;
}
