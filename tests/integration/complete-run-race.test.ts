import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as noteService from "@/server/notes/note-service";
import * as profileService from "@/server/runtime/ai-profile-service";
import { enqueueTodayBriefingAi } from "@/server/runtime/briefing-service";
import * as capacityRepo from "@/server/runtime/capacity-repository";
import * as runtimeService from "@/server/runtime/runtime-service";
import * as authorityService from "@/server/runtime/standing-authority-service";
import { registerMilesRuntime } from "../support/runtime-fixtures";
import { openPostgresRaceHarness, type PostgresRaceHarness } from "../support/postgres-race";

/**
 * Overlapping completeRun transactions on two PostgreSQL connections.
 * A PGlite suite cannot establish this: it serializes work on one backend.
 */

const PROPOSAL = {
  status: "succeeded" as const,
  resultSummary: "Drafted today's AI briefing.",
  proposal: {
    kind: "create_note" as const,
    title: "AI Today briefing",
    body: "## Priorities\n- Review TylerOS runtime PR",
  },
};

describe("completeRun races on PostgreSQL", () => {
  let harness: PostgresRaceHarness | null = null;

  beforeAll(async () => {
    harness = await openPostgresRaceHarness();
    if (!harness && process.env.TYLEROS_REQUIRE_PG_RACE === "1") {
      throw new Error(
        "PostgreSQL race harness is required (set TYLEROS_RACE_DATABASE_URL or DATABASE_URL).",
      );
    }
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  it("lets only one overlapping completion create usage, approval, and a note", async ({
    skip,
  }) => {
    if (!harness) {
      skip();
      return;
    }

    const { dbA, dbB } = harness;
    await authorityService.grantStandingAuthority(dbA, {
      key: "miles-ai-briefing-note",
      role: "miles",
      jobKind: "today_briefing_ai",
      action: "create_note",
    });
    const profile = await profileService.createAiExecutionProfile(dbA, {
      key: "miles-briefing-primary",
      name: "Miles Briefing Primary",
      provider: "anthropic",
      model: "claude-opus-5",
      product: null,
      poolKey: null,
      enabled: true,
    });
    const job = await enqueueTodayBriefingAi(dbA, profile.id);
    const runtime = await registerMilesRuntime(dbA, "home-desktop-python");
    const claimed = await runtimeService.claimNextJob(dbA, {
      runtimeId: runtime.id,
      role: "miles",
    });
    if (!claimed) throw new Error("expected a claim");
    expect(claimed.job.id).toBe(job.id);

    const results = await Promise.allSettled([
      runtimeService.completeValidatedAiRun(dbA, claimed.run.id, runtime.id, PROPOSAL),
      runtimeService.completeValidatedAiRun(dbB, claimed.run.id, runtime.id, PROPOSAL),
    ]);

    const won = results.filter((result) => result.status === "fulfilled");
    const lost = results.filter((result) => result.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "This attempt is no longer the current claim." }),
    });

    expect(await noteService.listNotes(dbA)).toHaveLength(1);
    expect(await noteService.listNotes(dbB)).toHaveLength(1);
    expect(await capacityRepo.listUsageForRun(dbA, claimed.run.id)).toHaveLength(1);

    const [row] = await runtimeService.listRuntimeBoard(dbA);
    expect(row?.latestApproval?.status).toBe("auto_executed");
    expect(row?.pendingApproval).toBeNull();
  }, 60_000);
});
