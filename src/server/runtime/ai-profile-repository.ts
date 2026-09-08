import { desc, eq } from "drizzle-orm";
import type { AiExecutionProfile, AiProvider } from "@/domain/runtime/ai-profile";
import { isAiProvider } from "@/domain/runtime/ai-profile";
import type { Database } from "@/server/db/client";
import { aiExecutionProfiles, type AiExecutionProfileRow } from "@/server/db/schema";

export function toAiExecutionProfile(row: AiExecutionProfileRow): AiExecutionProfile {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    provider: requireProvider(row.provider),
    model: row.model,
    product: row.product,
    capacityPoolId: row.capacityPoolId,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertAiExecutionProfile(
  db: Database,
  values: {
    key: string;
    name: string;
    provider: AiProvider;
    model: string;
    product: string | null;
    capacityPoolId: string | null;
    enabled: boolean;
  },
): Promise<AiExecutionProfile> {
  const [row] = await db.insert(aiExecutionProfiles).values(values).returning();
  if (!row) throw new Error("Insert returned no AI execution profile.");
  return toAiExecutionProfile(row);
}

export async function findAiExecutionProfileById(
  db: Database,
  id: string,
): Promise<AiExecutionProfile | null> {
  const [row] = await db
    .select()
    .from(aiExecutionProfiles)
    .where(eq(aiExecutionProfiles.id, id))
    .limit(1);
  return row ? toAiExecutionProfile(row) : null;
}

export async function findAiExecutionProfileByKey(
  db: Database,
  key: string,
): Promise<AiExecutionProfile | null> {
  const [row] = await db
    .select()
    .from(aiExecutionProfiles)
    .where(eq(aiExecutionProfiles.key, key))
    .limit(1);
  return row ? toAiExecutionProfile(row) : null;
}

export async function listAiExecutionProfiles(db: Database): Promise<AiExecutionProfile[]> {
  const rows = await db
    .select()
    .from(aiExecutionProfiles)
    .orderBy(desc(aiExecutionProfiles.createdAt));
  return rows.map(toAiExecutionProfile);
}

export async function listEnabledAiExecutionProfiles(db: Database): Promise<AiExecutionProfile[]> {
  const rows = await db
    .select()
    .from(aiExecutionProfiles)
    .where(eq(aiExecutionProfiles.enabled, true))
    .orderBy(aiExecutionProfiles.name);
  return rows.map(toAiExecutionProfile);
}

function requireProvider(value: string): AiProvider {
  if (!isAiProvider(value)) {
    throw new Error(`Unsupported AI provider stored on a profile: ${value}`);
  }
  return value;
}
