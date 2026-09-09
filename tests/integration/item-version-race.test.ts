import "dotenv/config";
import { afterAll, beforeAll, expect, it } from "vitest";
import { updateItemSchema } from "@/domain/items/item-schema";
import * as items from "@/server/items/item-service";
import { editMobileItem } from "@/server/mobile/mobile-service";
import { openPostgresRaceHarness, type PostgresRaceHarness } from "../support/postgres-race";
let harness: PostgresRaceHarness | null;
beforeAll(async () => {
  harness = await openPostgresRaceHarness();
  if (!harness && process.env.TYLEROS_REQUIRE_PG_RACE === "1")
    throw new Error("PostgreSQL race harness required.");
}, 60000);
afterAll(async () => {
  await harness?.close();
});
it("allows exactly one overlapping web or phone draft to commit", async ({ skip }) => {
  if (!harness) {
    skip();
    return;
  }
  const { dbA, dbB } = harness;
  const id = await items.captureItem(dbA, { text: "shared draft", projectId: null });
  const before = (await items.getItem(dbA, id))!;
  const version = before.updatedAt.toISOString();
  const results = await Promise.allSettled([
    items.updateItemFromSnapshot(
      dbA,
      updateItemSchema.parse({ ...before, title: "web", tags: ["web"] }),
      version,
    ),
    editMobileItem(dbB, id, {
      requestId: crypto.randomUUID(),
      expectedUpdatedAt: version,
      title: "phone",
    }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "conflict" },
  });
  const saved = (await items.getItem(dbA, id))!;
  expect(saved.title).toBe(results[0]!.status === "fulfilled" ? "web" : "phone");
  expect(saved.tags.map((t) => t.name)).toEqual(results[0]!.status === "fulfilled" ? ["web"] : []);
});
