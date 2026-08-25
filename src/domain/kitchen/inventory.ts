import type { IsoDate } from "@/domain/shared/date";

/**
 * Kitchen inventory: what food is actually in the house.
 *
 * This is deliberately **not** an Item. Items are things captured, thought
 * about, or acted on — "buy more olive oil" is an item. The jar of olive oil in
 * the pantry is a structured record of the world, and it gets its own table.
 * See docs/ARCHITECTURE.md.
 *
 * The whole value of an inventory is that it is true. Every design choice here
 * favours recording what someone would actually say over data that looks tidy:
 * two chicken packages with different dates stay two records, an uncounted bag
 * of rice is allowed to have no number, and nothing is ever merged automatically.
 */

export const KITCHEN_LOCATIONS = ["fridge", "freezer", "pantry"] as const;
export type KitchenLocation = (typeof KITCHEN_LOCATIONS)[number];

export const KITCHEN_LOCATION_LABELS: Record<KitchenLocation, string> = {
  fridge: "Fridge",
  freezer: "Freezer",
  pantry: "Pantry",
};

export interface InventoryItem {
  id: string;
  name: string;
  location: KitchenLocation;
  /** `null` means "some, uncounted" — an honest answer for a bag of rice. */
  quantity: number | null;
  /** `null` means a bare count: 8 eggs, not 8 of anything. */
  unit: string | null;
  expiresOn: IsoDate | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function isKitchenLocation(value: string): value is KitchenLocation {
  return (KITCHEN_LOCATIONS as readonly string[]).includes(value);
}

/**
 * Units people actually say in a kitchen, offered as suggestions rather than
 * enforced as an enum.
 *
 * A closed list cannot express "0.5 bag" or "1 bottle" without growing forever,
 * and a unit column that needs a migration to hold "loaf" is a column that will
 * be worked around. Nothing here is ever converted into anything else: this is a
 * personal kitchen, not a warehouse, and 2 lb of chicken is 2 lb of chicken.
 */
export const COMMON_UNITS = [
  "lb",
  "oz",
  "g",
  "kg",
  "cup",
  "tbsp",
  "tsp",
  "ml",
  "l",
  "can",
  "jar",
  "bottle",
  "bag",
  "box",
  "pack",
  "loaf",
  "bunch",
  "dozen",
] as const;

export const MAX_INVENTORY_NAME_LENGTH = 120;
export const MAX_UNIT_LENGTH = 24;
export const MAX_INVENTORY_NOTES_LENGTH = 2_000;

/** Quantities are stored as numeric(10,2): two decimals is finer than any kitchen. */
export const QUANTITY_DECIMALS = 2;
export const MAX_QUANTITY = 99_999_999;

/**
 * Units are compared and stored lowercase so "Lb" and "lb" are the same unit.
 * No attempt is made to canonicalise "lbs" to "lb" — guessing at what someone
 * meant is how an inventory stops being trustworthy.
 */
export function normalizeUnit(raw: string): string | null {
  const unit = raw.trim().toLowerCase().slice(0, MAX_UNIT_LENGTH);
  return unit.length === 0 ? null : unit;
}
