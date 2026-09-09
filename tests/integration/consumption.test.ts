import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { items, kitchenInventory } from "@/server/db/schema";
import { createTestDatabase, type TestDatabase } from "../support/test-database";
import { captureMobile } from "@/server/mobile/mobile-service";
import { createMobileSession } from "@/server/mobile/mobile-auth";
import { handleMobileRequest } from "@/server/mobile/mobile-http";
import {
  logConsumption,
  getConsumptionHistory,
  getConsumptionSummary,
  changeConsumption,
} from "@/server/consumption/consumption-service";
let harness: TestDatabase;
beforeAll(async () => {
  harness = await createTestDatabase();
  vi.stubEnv("TYLEROS_TIME_ZONE", "America/Phoenix");
});
afterAll(async () => {
  await harness.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await harness.truncate();
});
it("writes consumption without creating a task, moving stock or interpreting dates/tags", async () => {
  const result = await captureMobile(harness.db, "food: burrito friday @cafe #spicy");
  expect(result.entityType).toBe("consumption");
  const history = await getConsumptionHistory(harness.db);
  expect(history.entries[0]?.description).toBe("burrito friday @cafe #spicy");
  expect(history.feedback).toEqual([]);
  expect(await harness.db.select().from(items)).toHaveLength(0);
  expect(await harness.db.select().from(kitchenInventory)).toHaveLength(0);
});
it("counts the personal day and removes/restores records and preference evidence together", async () => {
  const now = new Date("2026-09-10T02:00:00Z");
  const food = await logConsumption(harness.db, { kind: "food", description: "Burrito" }, now);
  await logConsumption(
    harness.db,
    { kind: "drink", description: "Water" },
    new Date("2026-09-10T07:00:00Z"),
  );
  expect(await getConsumptionSummary(harness.db, now)).toMatchObject({
    food: 1,
    drink: 0,
    day: "2026-09-09",
  });
  await changeConsumption(harness.db, food.id, "like");
  expect((await getConsumptionHistory(harness.db, now)).feedback[0]?.likes).toBe(1);
  await changeConsumption(harness.db, food.id, "remove");
  expect(await getConsumptionSummary(harness.db, now)).toMatchObject({ food: 0 });
  expect((await getConsumptionHistory(harness.db, now)).feedback).toEqual([]);
  await changeConsumption(harness.db, food.id, "restore");
  expect((await getConsumptionHistory(harness.db, now)).feedback[0]?.likes).toBe(1);
  await changeConsumption(harness.db, food.id, "clear");
  expect((await getConsumptionHistory(harness.db, now)).feedback).toEqual([]);
});
it("replays a mobile capture once, rejects changed intent, and authenticates feedback", async () => {
  const config = {
    mode: "guarded" as const,
    passphrase: "synthetic-food-passphrase",
    secret: "synthetic-food-secret-at-least-thirty-two-characters",
  };
  const session = await createMobileSession(harness.db, config, config.passphrase);
  const call = (route: string, method: string, body?: unknown, token = session.token) =>
    handleMobileRequest(
      harness.db,
      config,
      new Request("http://localhost/api/mobile/" + route, {
        method,
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      route.split("/"),
    );
  const input = { requestId: crypto.randomUUID(), text: "drink: iced coffee" };
  const first = await call("capture", "POST", input);
  expect(first.status).toBe(200);
  const data = (await first.json()).data;
  expect((await (await call("capture", "POST", input)).json()).data).toEqual(data);
  expect((await getConsumptionHistory(harness.db)).entries).toHaveLength(1);
  expect((await call("capture", "POST", { ...input, text: "food: changed" })).status).toBe(409);
  expect(
    (
      await call(
        "consumption/" + data.id,
        "PATCH",
        { requestId: crypto.randomUUID(), action: "like" },
        "invalid",
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await call("consumption/" + data.id, "PATCH", {
        requestId: crypto.randomUUID(),
        action: "like",
      })
    ).status,
  ).toBe(200);
  expect((await (await call("consumption", "GET")).json()).data.feedback[0].likes).toBe(1);
  expect(
    (
      await call("consumption/" + data.id, "PATCH", {
        requestId: crypto.randomUUID(),
        action: "guess-calories",
      })
    ).status,
  ).toBe(400);
});
