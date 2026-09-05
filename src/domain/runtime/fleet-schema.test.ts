import { describe, expect, it } from "vitest";
import { bootstrapRuntimeSchema } from "./fleet-schema";

describe("bootstrapRuntimeSchema", () => {
  it("rejects bootstrap without an explicit role", () => {
    const parsed = bootstrapRuntimeSchema.safeParse({
      instanceKey: "home-desktop-python",
      name: "Home Desktop Python",
      kind: "python",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts one or more named roles", () => {
    const parsed = bootstrapRuntimeSchema.parse({
      instanceKey: "home-desktop-python",
      name: "Home Desktop Python",
      kind: "python",
      roles: ["miles"],
    });
    expect(parsed.roles).toEqual(["miles"]);
  });
});
