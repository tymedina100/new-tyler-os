import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { approvals, standingAuthorities } from "@/server/db/schema";
import * as itemService from "@/server/items/item-service";
import * as noteService from "@/server/notes/note-service";
import * as profileService from "@/server/runtime/ai-profile-service";
import { briefAiRun, enqueueTodayBriefingAi } from "@/server/runtime/briefing-service";
import * as capacityRepo from "@/server/runtime/capacity-repository";
import * as runtimeService from "@/server/runtime/runtime-service";
import * as authorityService from "@/server/runtime/standing-authority-service";
import { registerMilesRuntime } from "../support/runtime-fixtures";
import { createTestDatabase, type TestDatabase } from "../support/test-database";

let harness: TestDatabase;

beforeAll(async () => {
  harness = await createTestDatabase();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function db() {
  return harness.db;
}

const NOW = new Date("2026-09-05T12:00:00.000Z");
const VALID_JSON = JSON.stringify({
  summary: "Review the runtime PR today.",
  priorities: ["Review TylerOS runtime PR"],
  needsTyler: ["Accept or comment on the PR."],
  watch: [],
});

const MILES_AI_NOTE = {
  key: "miles-ai-briefing-note",
  role: "miles" as const,
  jobKind: "today_briefing_ai" as const,
  action: "create_note" as const,
};

describe("fresh database", () => {
  it("grants no standing authority", async () => {
    const fresh = await createTestDatabase();
    try {
      const rows = await fresh.db.select({ id: standingAuthorities.id }).from(standingAuthorities);
      expect(rows).toHaveLength(0);
    } finally {
      await fresh.close();
    }
  });
});

describe("explicit grant and revoke", () => {
  it("stores the Miles AI briefing note grant and rejects a duplicate key", async () => {
    const granted = await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    expect(granted).toMatchObject({ ...MILES_AI_NOTE, enabled: true });

    await expect(authorityService.grantStandingAuthority(db(), MILES_AI_NOTE)).rejects.toThrow(
      /already exists/,
    );
  });

  it("does not execute when the grant is disabled", async () => {
    await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    await authorityService.revokeStandingAuthority(db(), MILES_AI_NOTE.key);
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();

    const outcome = await briefWithMock(claimed.run.id, runtime.id);
    expect(outcome.status).toBe("needs_approval");
    expect(await noteService.listNotes(db())).toHaveLength(0);
  });
});

describe("Miles AI briefing without authority", () => {
  it("creates a pending approval and no note until Tyler accepts", async () => {
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();
    const capture = vi.spyOn(noteService, "captureNote");

    const outcome = await briefWithMock(claimed.run.id, runtime.id);
    expect(outcome.status).toBe("needs_approval");
    expect(capture).not.toHaveBeenCalled();
    expect(await noteService.listNotes(db())).toHaveLength(0);

    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.pendingApproval).toBeTruthy();
    expect(row?.latestApproval?.status).toBe("pending");
    expect(row?.latestApproval?.standingAuthorityKey).toBeNull();
  });
});

describe("Miles AI briefing with matching authority", () => {
  it("auto-executes through noteService with standing-authority audit", async () => {
    await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();
    const capture = vi.spyOn(noteService, "captureNote");

    const outcome = await briefWithMock(claimed.run.id, runtime.id);
    expect(outcome.status).toBe("succeeded");
    expect(capture).toHaveBeenCalledTimes(1);

    const notes = await noteService.listNotes(db());
    expect(notes).toHaveLength(1);
    expect(notes[0]?.body).toContain("Review TylerOS runtime PR");

    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("succeeded");
    expect(row?.pendingApproval).toBeNull();
    expect(row?.latestApproval).toMatchObject({
      status: "auto_executed",
      standingAuthorityKey: "miles-ai-briefing-note",
      acceptedNoteId: notes[0]?.id,
    });
    expect(row?.latestApproval?.status).not.toBe("accepted");
  });

  it("distinguishes Tyler Accept from standing-authority execution", async () => {
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();
    await briefWithMock(claimed.run.id, runtime.id);
    const [pending] = await runtimeService.listRuntimeBoard(db());
    const approvalId = pending?.pendingApproval?.id;
    if (!approvalId) throw new Error("expected approval");
    await runtimeService.acceptApproval(db(), approvalId);

    const [accepted] = await db().select().from(approvals);
    expect(accepted).toMatchObject({
      status: "accepted",
      standingAuthorityKey: null,
      standingAuthorityId: null,
    });
    expect(accepted?.acceptedNoteId).toBeTruthy();
  });
});

describe("isolation", () => {
  it("does not let a Forge grant authorize a Miles job", async () => {
    await authorityService.grantStandingAuthority(db(), {
      key: "forge-ai-briefing-note",
      role: "forge",
      jobKind: "today_briefing_ai",
      action: "create_note",
    });
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();
    const outcome = await briefWithMock(claimed.run.id, runtime.id);
    expect(outcome.status).toBe("needs_approval");
    expect(await noteService.listNotes(db())).toHaveLength(0);
  });

  it("does not let a deterministic-briefing grant authorize the AI job", async () => {
    await authorityService.grantStandingAuthority(db(), {
      key: "miles-deterministic-briefing-note",
      role: "miles",
      jobKind: "today_briefing",
      action: "create_note",
    });
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();
    const outcome = await briefWithMock(claimed.run.id, runtime.id);
    expect(outcome.status).toBe("needs_approval");
    expect(await noteService.listNotes(db())).toHaveLength(0);
  });

  it("does not let miles-ai-briefing-note authorize the 06:20 deterministic briefing", async () => {
    await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    const job = await runtimeService.enqueueTodayBriefing(db());
    const runtime = await registerMilesRuntime(db(), "home-desktop-python");
    const claimed = await runtimeService.claimNextJob(db(), {
      runtimeId: runtime.id,
      role: "miles",
    });
    if (!claimed) throw new Error("expected a claim");
    expect(claimed.job.id).toBe(job.id);

    await runtimeService.completeRun(db(), claimed.run.id, runtime.id, {
      status: "succeeded",
      resultSummary: "Drafted today's briefing.",
      proposal: {
        kind: "create_note",
        title: "Today briefing — 5 Sep 2026",
        body: "## Overdue\n- Pay rent",
      },
    });

    expect(await noteService.listNotes(db())).toHaveLength(0);
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("needs_approval");
    expect(row?.pendingApproval).toBeTruthy();
  });
});

describe("revocation", () => {
  it("returns later runs to pending approval without changing the earlier note", async () => {
    await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    const first = await claimAiJob();
    await addDueTodayItem();
    await briefWithMock(first.claimed.run.id, first.runtime.id);
    expect(await noteService.listNotes(db())).toHaveLength(1);

    await authorityService.revokeStandingAuthority(db(), MILES_AI_NOTE.key);
    const second = await claimAiJob("miles-briefing-second");
    const outcome = await briefWithMock(second.claimed.run.id, second.runtime.id);
    expect(outcome.status).toBe("needs_approval");
    expect(await noteService.listNotes(db())).toHaveLength(1);
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.pendingApproval).toBeTruthy();
  });
});

describe("failures still create no note when authority is granted", () => {
  it("creates no note for malformed model output", async () => {
    await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();
    const outcome = await briefAiRun(
      db(),
      claimed.run.id,
      runtime.id,
      async () => ({
        ok: true,
        text: "Sure, here is a briefing in markdown.",
        model: "claude-opus-5",
        usage: { inputTokens: 80, cachedInputTokens: 0, outputTokens: 40 },
      }),
      NOW,
    );
    expect(outcome.status).toBe("failed");
    expect(await noteService.listNotes(db())).toHaveLength(0);
  });

  it("creates no note when the provider call fails", async () => {
    await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();
    const outcome = await briefAiRun(
      db(),
      claimed.run.id,
      runtime.id,
      async () => ({ ok: false, failure: "not_configured", usage: null }),
      NOW,
    );
    expect(outcome.status).toBe("failed");
    expect(await noteService.listNotes(db())).toHaveLength(0);
  });

  it("keeps empty Today as zero-AI with no authority evaluation", async () => {
    await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    const { claimed, runtime } = await claimAiJob();
    let calls = 0;
    const outcome = await briefAiRun(
      db(),
      claimed.run.id,
      runtime.id,
      async () => {
        calls += 1;
        throw new Error("provider must not be called");
      },
      NOW,
    );
    expect(outcome.status).toBe("succeeded");
    expect(calls).toBe(0);
    expect(await noteService.listNotes(db())).toHaveLength(0);
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.latestApproval).toBeNull();
    expect(row?.latestRun?.provider).toBe("none");
    expect(row?.latestRun?.model).toBe("deterministic");
  });
});

describe("concurrent auto-execution", () => {
  it("creates exactly one note when two /brief calls race under authority", async () => {
    await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;

    const caller = async () => {
      calls += 1;
      await gate;
      return {
        ok: true as const,
        text: VALID_JSON,
        model: "claude-opus-5",
        usage: { inputTokens: 11, cachedInputTokens: 0, outputTokens: 3 },
      };
    };

    const first = track(briefAiRun(db(), claimed.run.id, runtime.id, caller, NOW));
    const second = track(briefAiRun(db(), claimed.run.id, runtime.id, caller, NOW));

    await vi.waitFor(() => {
      expect(calls).toBe(1);
    });

    const loserError = await Promise.race([
      first.settled.then((result) => (result.ok ? hang() : result.error)),
      second.settled.then((result) => (result.ok ? hang() : result.error)),
    ]);
    expect(loserError).toMatchObject({
      message: "This run's AI request has already started.",
    });

    release();
    const settled = await Promise.all([first.settled, second.settled]);
    const fulfilled = settled.filter((result) => result.ok);
    const rejected = settled.filter((result) => !result.ok);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0]).toMatchObject({ value: { status: "succeeded" } });
    expect(await noteService.listNotes(db())).toHaveLength(1);
  });
});

describe("worker completion cannot bypass validated AI", () => {
  it("rejects an arbitrary /complete proposal on an AI briefing", async () => {
    await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    const { claimed, runtime } = await claimAiJob();
    await addDueTodayItem();

    await expect(
      runtimeService.completeRun(db(), claimed.run.id, runtime.id, {
        status: "succeeded",
        resultSummary: "I wrote a note myself.",
        proposal: {
          kind: "create_note",
          title: "Unvalidated briefing",
          body: "This never passed Miles judgment.",
        },
      }),
    ).rejects.toThrow(/validates Miles judgment/);

    expect(await noteService.listNotes(db())).toHaveLength(0);
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("running");
    expect(row?.pendingApproval).toBeNull();
    expect(row?.latestApproval).toBeNull();
    expect(row?.latestRun?.status).toBe("running");
    expect(row?.latestRun?.resultSummary).toBeNull();
  });

  it("still lets the worker complete an empty AI briefing with no proposal", async () => {
    const { claimed, runtime } = await claimAiJob();
    await runtimeService.completeRun(db(), claimed.run.id, runtime.id, {
      status: "succeeded",
      resultSummary: "No material Today items.",
      usage: { provider: "none", model: "deterministic" },
    });

    expect(await noteService.listNotes(db())).toHaveLength(0);
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("succeeded");
    expect(row?.latestApproval).toBeNull();
  });
});

describe("completion ownership", () => {
  it("rolls back when noteService.captureNote fails during auto-execution", async () => {
    await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    const { claimed, runtime } = await claimAiJob();
    vi.spyOn(noteService, "captureNote").mockRejectedValueOnce(new Error("note write failed"));

    await expect(
      runtimeService.completeValidatedAiRun(db(), claimed.run.id, runtime.id, {
        status: "succeeded",
        resultSummary: "Drafted today's AI briefing.",
        proposal: {
          kind: "create_note",
          title: "AI Today briefing",
          body: "## Priorities\n- Review TylerOS runtime PR",
        },
      }),
    ).rejects.toThrow(/note write failed/);

    expect(await noteService.listNotes(db())).toHaveLength(0);
    const [row] = await runtimeService.listRuntimeBoard(db());
    expect(row?.job.status).toBe("running");
    expect(row?.latestApproval).toBeNull();
    expect(row?.latestRun?.status).toBe("running");
    expect(await capacityRepo.listUsageForRun(db(), claimed.run.id)).toHaveLength(0);
  });

  it("lets only one sequential completion write usage and a note", async () => {
    await authorityService.grantStandingAuthority(db(), MILES_AI_NOTE);
    const { claimed, runtime } = await claimAiJob();
    const input = {
      status: "succeeded" as const,
      resultSummary: "Drafted today's AI briefing.",
      proposal: {
        kind: "create_note" as const,
        title: "AI Today briefing",
        body: "## Priorities\n- Review TylerOS runtime PR",
      },
    };

    await runtimeService.completeValidatedAiRun(db(), claimed.run.id, runtime.id, input);
    await expect(
      runtimeService.completeValidatedAiRun(db(), claimed.run.id, runtime.id, input),
    ).rejects.toThrow(/no longer the current claim/);

    expect(await noteService.listNotes(db())).toHaveLength(1);
    expect(await capacityRepo.listUsageForRun(db(), claimed.run.id)).toHaveLength(1);
  });
});

async function briefWithMock(runId: string, runtimeId: string) {
  return briefAiRun(
    db(),
    runId,
    runtimeId,
    async () => ({
      ok: true as const,
      text: VALID_JSON,
      model: "claude-opus-5",
      usage: { inputTokens: 12, cachedInputTokens: 0, outputTokens: 4 },
    }),
    NOW,
  );
}

async function claimAiJob(profileKey = "miles-briefing-primary") {
  const profile = await profileService.createAiExecutionProfile(db(), {
    key: profileKey,
    name: "Miles Briefing Primary",
    provider: "anthropic",
    model: "claude-opus-5",
    product: "Anthropic API",
    poolKey: null,
    enabled: true,
  });
  const job = await enqueueTodayBriefingAi(db(), profile.id);
  const runtime = await registerMilesRuntime(db(), `python-${profileKey}`);
  const claimed = await runtimeService.claimNextJob(db(), {
    runtimeId: runtime.id,
    role: "miles",
  });
  if (!claimed) throw new Error("expected a claim");
  expect(claimed.job.id).toBe(job.id);
  return { claimed, runtime, profile };
}

async function addDueTodayItem() {
  const id = await itemService.captureItem(db(), {
    text: "Review TylerOS runtime PR",
    projectId: null,
  });
  await itemService.updateItem(db(), {
    id,
    title: "Review TylerOS runtime PR",
    body: null,
    kind: "task",
    status: "active",
    dueOn: "2026-09-05",
    tags: [],
    projectId: null,
    recurrence: null,
  });
}

function track<T>(promise: Promise<T>): {
  settled: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>;
} {
  return {
    settled: promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  };
}

function hang(): Promise<never> {
  return new Promise(() => undefined);
}
