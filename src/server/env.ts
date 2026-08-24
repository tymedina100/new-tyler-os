import { z } from "zod";

/**
 * Server environment.
 *
 * Validation is lazy and memoised on purpose: `next build` must succeed on a
 * machine with no database configured, and a missing variable should fail at the
 * moment it is actually needed, with a message that says what to do about it.
 */

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(
      `Missing or invalid environment configuration: ${missing}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }

  cached = parsed.data;
  return cached;
}
