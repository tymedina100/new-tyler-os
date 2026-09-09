import { expect, it } from "vitest";
import {
  consumptionDay,
  consumptionFeedback,
  consumptionInputSchema,
  consumptionPatch,
  matchConsumptionPrefix,
  type ConsumptionEntry,
} from "./consumption";
it("routes only explicit food and drink prefixes and preserves meal text", () => {
  expect(matchConsumptionPrefix(" FOOD: Lunch friday #spicy @cafe ")).toEqual({
    kind: "food",
    description: "Lunch friday #spicy @cafe ",
  });
  expect(matchConsumptionPrefix("drink: water")).toEqual({ kind: "drink", description: "water" });
  for (const text of ["buy food: beans", "note: food: beans", "food shopping", "I drank water"])
    expect(matchConsumptionPrefix(text)).toBeNull();
  expect(consumptionInputSchema.safeParse(matchConsumptionPrefix("food: ")).success).toBe(false);
  expect(
    consumptionInputSchema.safeParse({ kind: "food", description: "x".repeat(1001) }).success,
  ).toBe(false);
});
it("uses the person's time zone instead of the host's UTC day", () => {
  expect(consumptionDay(new Date("2026-09-10T02:00:00Z"), "America/Phoenix")).toBe("2026-09-09");
  expect(consumptionDay(new Date("2026-09-10T07:00:00Z"), "America/Phoenix")).toBe("2026-09-10");
});
it("learns only from explicit nonremoved feedback and keeps contradictory evidence", () => {
  const entry: ConsumptionEntry = {
    id: "fixture",
    kind: "food",
    description: "Burrito",
    occurredAt: new Date("2026-09-09T12:00:00Z"),
    loggedOn: "2026-09-09",
    feedback: null,
    voidedAt: null,
  };
  expect(consumptionFeedback([entry])).toEqual([]);
  expect(
    consumptionFeedback([
      { ...entry, feedback: "like" },
      { ...entry, description: "  BURRITO ", feedback: "dislike" },
      { ...entry, feedback: "like", voidedAt: entry.occurredAt },
    ]),
  ).toEqual([{ description: "Burrito", likes: 1, dislikes: 1 }]);
});
it("makes removal reversible without erasing the original feedback", () => {
  const now = new Date("2026-09-09T12:00:00Z");
  expect(consumptionPatch("remove", now)).toEqual({ voidedAt: now });
  expect(consumptionPatch("restore", now)).toEqual({ voidedAt: null });
  expect(consumptionPatch("clear", now)).toEqual({ feedback: null });
});
