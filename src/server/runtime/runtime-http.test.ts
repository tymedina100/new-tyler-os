import { describe, expect, it } from "vitest";
import { authenticateMachine } from "./runtime-http";

describe("authenticateMachine", () => {
  it("turns the scheduler tick off when RUNTIME_TOKEN is missing, with no role required", async () => {
    const response = authenticateMachine(
      new Request("http://localhost/api/runtime/schedules/tick", { method: "POST" }),
    );
    expect(response).not.toBe(true);
    if (response === true) return;
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "RUNTIME_TOKEN is not set, so the machine API is off.",
    });
  });
});
