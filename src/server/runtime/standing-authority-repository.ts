import { eq } from "drizzle-orm";
import type { ApprovalKind, JobKind, Role } from "@/domain/runtime/runtime";
import type { StandingAuthority } from "@/domain/runtime/standing-authority";
import type { Database } from "@/server/db/client";
import { standingAuthorities, type StandingAuthorityRow } from "@/server/db/schema";

export function toStandingAuthority(row: StandingAuthorityRow): StandingAuthority {
  return {
    id: row.id,
    key: row.key,
    role: row.role,
    jobKind: row.jobKind,
    action: row.action,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertStandingAuthority(
  db: Database,
  values: {
    key: string;
    role: Role;
    jobKind: JobKind;
    action: ApprovalKind;
    enabled: boolean;
  },
): Promise<StandingAuthority> {
  const [row] = await db.insert(standingAuthorities).values(values).returning();
  if (!row) throw new Error("Insert returned no standing authority.");
  return toStandingAuthority(row);
}

export async function findStandingAuthorityByKey(
  db: Database,
  key: string,
): Promise<StandingAuthority | null> {
  const [row] = await db
    .select()
    .from(standingAuthorities)
    .where(eq(standingAuthorities.key, key))
    .limit(1);
  return row ? toStandingAuthority(row) : null;
}

export async function listStandingAuthorities(db: Database): Promise<StandingAuthority[]> {
  const rows = await db.select().from(standingAuthorities).orderBy(standingAuthorities.key);
  return rows.map(toStandingAuthority);
}

export async function listEnabledStandingAuthorities(db: Database): Promise<StandingAuthority[]> {
  const rows = await db
    .select()
    .from(standingAuthorities)
    .where(eq(standingAuthorities.enabled, true))
    .orderBy(standingAuthorities.key);
  return rows.map(toStandingAuthority);
}

export async function updateStandingAuthorityEnabled(
  db: Database,
  key: string,
  enabled: boolean,
): Promise<StandingAuthority | null> {
  const [row] = await db
    .update(standingAuthorities)
    .set({ enabled })
    .where(eq(standingAuthorities.key, key))
    .returning();
  return row ? toStandingAuthority(row) : null;
}
