import { z } from "zod";
import {
  KITCHEN_LOCATIONS,
  MAX_INVENTORY_NAME_LENGTH,
  MAX_INVENTORY_NOTES_LENGTH,
  MAX_QUANTITY,
  MAX_UNIT_LENGTH,
  normalizeUnit,
  QUANTITY_DECIMALS,
} from "@/domain/kitchen/inventory";
import { isIsoDate } from "@/domain/shared/date";

/**
 * Validation for everything entering the kitchen.
 *
 * Inputs arrive from HTML forms, so every field is a string — including the
 * empty string, which has to become `null` rather than `0` or `""`. The
 * difference between "no quantity given" and "zero of it" is the difference
 * between an uncounted bag of rice and an empty one, and both are real answers.
 */

export const inventoryNameSchema = z
  .string()
  .trim()
  .min(1, "Give it a name.")
  .max(MAX_INVENTORY_NAME_LENGTH, `Keep names under ${MAX_INVENTORY_NAME_LENGTH} characters.`);

/**
 * Quantity is optional, never negative, and rounded to the stored precision so
 * the number shown is the number kept.
 */
export const quantitySchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? trimmed : parsed;
  },
  z
    .number("Use a number, or leave it blank.")
    .refine(Number.isFinite, "Use a number, or leave it blank.")
    .min(0, "A quantity cannot be negative.")
    .max(MAX_QUANTITY, "That is more food than a kitchen holds.")
    .transform((value) => Number(value.toFixed(QUANTITY_DECIMALS)))
    .nullable(),
);

export const unitSchema = z.preprocess((value) => {
  if (typeof value !== "string") return (value ?? null) as unknown;
  return normalizeUnit(value);
}, z.string().max(MAX_UNIT_LENGTH).nullable());

export const expiresOnSchema = z.preprocess((value) => {
  if (typeof value !== "string") return (value ?? null) as unknown;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}, z.string().refine(isIsoDate, "Use a valid date.").nullable());

const notesSchema = z.preprocess((value) => {
  if (typeof value !== "string") return (value ?? null) as unknown;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}, z.string().max(MAX_INVENTORY_NOTES_LENGTH).nullable());

/**
 * The fast path. A name and a location are the whole requirement, because an
 * inventory only stays true if adding to it costs almost nothing.
 */
export const addInventoryItemSchema = z.object({
  name: inventoryNameSchema,
  location: z.enum(KITCHEN_LOCATIONS, { message: "Pick a location." }),
  quantity: quantitySchema,
  unit: unitSchema,
  expiresOn: expiresOnSchema,
  notes: notesSchema,
});
export type AddInventoryItemInput = z.infer<typeof addInventoryItemSchema>;

export const updateInventoryItemSchema = addInventoryItemSchema.extend({ id: z.uuid() });
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;

export const inventoryItemIdSchema = z.object({ id: z.uuid() });

/** Quantity nudges from the list, where retyping the whole record is too slow. */
export const setInventoryQuantitySchema = z.object({
  id: z.uuid(),
  quantity: quantitySchema,
});

export const setInventoryLocationSchema = z.object({
  id: z.uuid(),
  location: z.enum(KITCHEN_LOCATIONS, { message: "Pick a location." }),
});
