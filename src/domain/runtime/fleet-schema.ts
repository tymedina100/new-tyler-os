import { z } from "zod";
import { CAPACITY_CONFIDENCE, CAPACITY_RESET_TYPES, CAPACITY_UNITS } from "./capacity";
import { INSTANCE_KEY_PATTERN, RUNTIME_CAPABILITIES } from "./fleet";
import { roleSchema, runtimeKindSchema } from "./runtime-schema";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length === 0 ? null : trimmed;
    });

export const instanceKeySchema = z
  .string()
  .trim()
  .regex(INSTANCE_KEY_PATTERN, "Instance keys are lowercase kebab-case, like home-desktop-python.");

export const bootstrapRuntimeSchema = z.object({
  instanceKey: instanceKeySchema,
  name: z.string().trim().min(1, "A runtime needs a name.").max(80),
  kind: runtimeKindSchema,
  deviceId: optionalText(120),
  capabilities: z.array(z.enum(RUNTIME_CAPABILITIES)).optional(),
  roles: z
    .array(roleSchema)
    .min(1, "A runtime needs an explicit role grant, for example --role miles."),
});
export type BootstrapRuntimeInput = z.infer<typeof bootstrapRuntimeSchema>;

export const updateCapacityRemainingSchema = z.object({
  poolId: z.uuid(),
  remaining: z.coerce.number(),
  estimateConfidence: z.enum(CAPACITY_CONFIDENCE).optional(),
  note: optionalText(500),
});
export type UpdateCapacityRemainingInput = z.infer<typeof updateCapacityRemainingSchema>;

export const capacityUnitSchema = z.enum(CAPACITY_UNITS);
export const capacityResetTypeSchema = z.enum(CAPACITY_RESET_TYPES);
