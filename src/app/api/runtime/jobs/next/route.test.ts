import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET } from "./route";
import type * as RuntimeHttp from "@/server/runtime/runtime-http";
import { authenticateRuntime } from "@/server/runtime/runtime-http";
import { claimNextJob } from "@/server/runtime/runtime-service";

vi.mock("@/server/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/runtime/runtime-service", () => ({
  claimNextJob: vi.fn().mockResolvedValue(null),
  markRuntimeSeen: vi.fn(),
}));
vi.mock("@/server/runtime/runtime-http", async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeHttp>()),
  authenticateRuntime: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticateRuntime).mockResolvedValue({
    runtime: { id: "runtime-fixture" },
    role: "miles",
  } as Awaited<ReturnType<typeof authenticateRuntime>>);
});

describe("runtime job capability query", () => {
  it("passes repeated supported kinds to the claim service", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/runtime/jobs/next?kind=today_briefing&kind=today_briefing_ai",
      ),
    );
    expect(response.status).toBe(200);
    expect(claimNextJob).toHaveBeenCalledWith(
      {},
      {
        runtimeId: "runtime-fixture",
        role: "miles",
        allowedJobKinds: ["today_briefing", "today_briefing_ai"],
      },
    );
  });

  it("keeps omitted kinds unrestricted for legacy workers", async () => {
    await GET(new Request("http://localhost/api/runtime/jobs/next"));
    expect(claimNextJob).toHaveBeenCalledWith(
      {},
      {
        runtimeId: "runtime-fixture",
        role: "miles",
        allowedJobKinds: undefined,
      },
    );
  });

  it.each(["kind=", "kind=send_email", "kind=today_briefing&kind=invalid"])(
    "rejects invalid capability query %s before claiming",
    async (query) => {
      const response = await GET(new Request(`http://localhost/api/runtime/jobs/next?${query}`));
      expect(response.status).toBe(400);
      expect(claimNextJob).not.toHaveBeenCalled();
    },
  );

  it("does not bypass runtime authentication when a capability filter is supplied", async () => {
    vi.mocked(authenticateRuntime).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await GET(
      new Request("http://localhost/api/runtime/jobs/next?kind=today_briefing"),
    );
    expect(response.status).toBe(401);
    expect(claimNextJob).not.toHaveBeenCalled();
  });
});
