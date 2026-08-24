import { z } from "zod";
import { PROJECT_STATUSES } from "./project";

export const MAX_PROJECT_NAME_LENGTH = 120;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 2_000;

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the project a name.")
    .max(MAX_PROJECT_NAME_LENGTH, `Keep names under ${MAX_PROJECT_NAME_LENGTH} characters.`),
  description: z.preprocess((value) => {
    if (typeof value !== "string") return (value ?? null) as unknown;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }, z.string().max(MAX_PROJECT_DESCRIPTION_LENGTH).nullable()),
  status: z.enum(PROJECT_STATUSES),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.extend({ id: z.uuid() });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const projectIdSchema = z.object({ id: z.uuid() });
