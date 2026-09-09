import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { runtimeCredentials, runtimes } from "@/server/db/schema";
import { prepareMobileRuntime } from "@/server/runtime/mobile-runtime-preparation-service";
import { bootstrapRuntime } from "@/server/runtime/fleet-service";
import * as fleetRepo from "@/server/runtime/fleet-repository";
import { findRuntimeByInstanceKey } from "@/server/runtime/runtime-repository";
import { generateRuntimeCredential, hashRuntimeSecret } from "@/server/runtime/runtime-token";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

let harness: TestDatabase;
const now = new Date("2026-09-09T12:00:00Z");
beforeAll(async () => {
  harness = await createTestDatabase();
});
afterAll(async () => {
  await harness.close();
});
beforeEach(async () => {
  await harness.truncate();
});

describe("optional hosted mobile runtime preparation", () => {
  it("creates only the intended hashed identity, and repeats without changing credentials or grants", async () => {
    const token = generateRuntimeCredential();
    const first = await prepareMobileRuntime(harness.db, token, now);
    const before = await harness.db.select().from(runtimeCredentials);
    expect(first.action).toBe("create");
    expect(first.runtime).toMatchObject({
      instanceKey: "mobile-companion-python",
      kind: "python",
      status: "enabled",
      lastSeenAt: null,
    });
    expect(before).toHaveLength(1);
    expect(before[0]?.tokenHash).toBe(hashRuntimeSecret(token));
    expect(JSON.stringify(before)).not.toContain(token);
    expect(await fleetRepo.listRoleGrants(harness.db, first.runtime.id)).toEqual(["miles"]);
    expect(await fleetRepo.listCapabilities(harness.db, first.runtime.id)).toEqual([
      "deterministic",
    ]);
    const repeated = await prepareMobileRuntime(
      harness.db,
      token,
      new Date("2026-09-10T12:00:00Z"),
    );
    expect(repeated).toEqual({ action: "unchanged", runtime: first.runtime });
    expect(await harness.db.select().from(runtimeCredentials)).toEqual(before);
  });

  it("refuses a new token for an existing instance without rotating its credential", async () => {
    const token = generateRuntimeCredential();
    const first = await prepareMobileRuntime(harness.db, token, now);
    await expect(
      prepareMobileRuntime(harness.db, generateRuntimeCredential(), now),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await fleetRepo.findRuntimeByTokenHash(harness.db, hashRuntimeSecret(token)))?.id).toBe(
      first.runtime.id,
    );
    expect(await harness.db.select().from(runtimeCredentials)).toHaveLength(1);
  });

  it("does not borrow another runtime credential", async () => {
    const other = await bootstrapRuntime(
      harness.db,
      { instanceKey: "other-python", name: "Other", kind: "python", roles: ["scout"] },
      now,
    );
    await expect(prepareMobileRuntime(harness.db, other.token, now)).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await findRuntimeByInstanceKey(harness.db, "mobile-companion-python")).toBeNull();
    expect(await fleetRepo.listRoleGrants(harness.db, other.runtime.id)).toEqual(["scout"]);
  });

  it("rolls back a runtime insert when a revoked token collides with the credential unique constraint", async () => {
    const other = await bootstrapRuntime(
      harness.db,
      { instanceKey: "revoked-python", name: "Revoked", kind: "python", roles: ["scout"] },
      now,
    );
    await harness.db
      .update(runtimeCredentials)
      .set({ revokedAt: now })
      .where(eq(runtimeCredentials.runtimeId, other.runtime.id));
    const before = await harness.db.select().from(runtimeCredentials);
    await expect(prepareMobileRuntime(harness.db, other.token, now)).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await findRuntimeByInstanceKey(harness.db, "mobile-companion-python")).toBeNull();
    expect(await harness.db.select().from(runtimeCredentials)).toEqual(before);
  });

  it.each(["roles", "capabilities", "disabled", "kind", "revoked"])(
    "refuses changed %s without restoring authority",
    async (change) => {
      const token = generateRuntimeCredential();
      const first = await prepareMobileRuntime(harness.db, token, now);
      if (change === "roles")
        await fleetRepo.replaceRoleGrants(harness.db, first.runtime.id, ["miles", "scout"]);
      if (change === "capabilities")
        await fleetRepo.replaceCapabilities(harness.db, first.runtime.id, [
          "deterministic",
          "code",
        ]);
      if (change === "disabled")
        await harness.db
          .update(runtimes)
          .set({ status: "disabled" })
          .where(eq(runtimes.id, first.runtime.id));
      if (change === "kind")
        await harness.db
          .update(runtimes)
          .set({ kind: "api" })
          .where(eq(runtimes.id, first.runtime.id));
      if (change === "revoked")
        await harness.db
          .update(runtimeCredentials)
          .set({ revokedAt: now })
          .where(eq(runtimeCredentials.runtimeId, first.runtime.id));
      const before = {
        runtimes: await harness.db.select().from(runtimes),
        credentials: await harness.db.select().from(runtimeCredentials),
        roles: await fleetRepo.listRoleGrants(harness.db, first.runtime.id),
        capabilities: await fleetRepo.listCapabilities(harness.db, first.runtime.id),
      };
      await expect(prepareMobileRuntime(harness.db, token, now)).rejects.toMatchObject({
        code: "conflict",
      });
      expect(await harness.db.select().from(runtimes)).toEqual(before.runtimes);
      expect(await harness.db.select().from(runtimeCredentials)).toEqual(before.credentials);
      expect(await fleetRepo.listRoleGrants(harness.db, first.runtime.id)).toEqual(before.roles);
      expect(await fleetRepo.listCapabilities(harness.db, first.runtime.id)).toEqual(
        before.capabilities,
      );
    },
  );
});
