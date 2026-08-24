import { describe, expect, it } from "vitest";
import { DomainError } from "@/domain/shared/errors";
import type { ItemLifecycle } from "./item-rules";
import {
  archiveItem,
  completeItem,
  reopenItem,
  resolveTriagedStatus,
  restoreItem,
  toggleItemCompletion,
} from "./item-rules";

const now = new Date("2026-08-24T09:00:00.000Z");
const earlier = new Date("2026-08-01T09:00:00.000Z");

function lifecycle(overrides: Partial<ItemLifecycle> = {}): ItemLifecycle {
  return { status: "inbox", completedAt: null, archivedAt: null, ...overrides };
}

describe("completeItem", () => {
  it("completes an open item and stamps the time", () => {
    expect(completeItem(lifecycle({ status: "active" }), now)).toEqual({
      status: "done",
      completedAt: now,
      archivedAt: null,
    });
  });

  it("completes straight out of the inbox", () => {
    expect(completeItem(lifecycle(), now).status).toBe("done");
  });

  it("is idempotent and preserves the original completion time", () => {
    const alreadyDone = lifecycle({ status: "done", completedAt: earlier });
    expect(completeItem(alreadyDone, now).completedAt).toBe(earlier);
  });

  it("refuses to complete an archived item", () => {
    expect(() => completeItem(lifecycle({ status: "archived", archivedAt: earlier }), now)).toThrow(
      DomainError,
    );
  });
});

describe("reopenItem", () => {
  it("returns a completed item to active and clears the completion time", () => {
    expect(reopenItem(lifecycle({ status: "done", completedAt: earlier }))).toEqual({
      status: "active",
      completedAt: null,
      archivedAt: null,
    });
  });

  it("refuses to reopen something that was never completed", () => {
    expect(() => reopenItem(lifecycle({ status: "active" }))).toThrow(DomainError);
  });
});

describe("archiveItem", () => {
  it("archives from any live status", () => {
    expect(archiveItem(lifecycle({ status: "someday" }), now)).toEqual({
      status: "archived",
      completedAt: null,
      archivedAt: now,
    });
  });

  it("keeps the completion time when archiving finished work", () => {
    const patch = archiveItem(lifecycle({ status: "done", completedAt: earlier }), now);
    expect(patch.completedAt).toBe(earlier);
    expect(patch.archivedAt).toBe(now);
  });

  it("is idempotent and preserves the original archive time", () => {
    const alreadyArchived = lifecycle({ status: "archived", archivedAt: earlier });
    expect(archiveItem(alreadyArchived, now).archivedAt).toBe(earlier);
  });
});

describe("restoreItem", () => {
  it("sends restored items back to the inbox for deliberate re-triage", () => {
    expect(restoreItem(lifecycle({ status: "archived", archivedAt: earlier }))).toEqual({
      status: "inbox",
      completedAt: null,
      archivedAt: null,
    });
  });

  it("refuses to restore something that is not archived", () => {
    expect(() => restoreItem(lifecycle({ status: "active" }))).toThrow(DomainError);
  });
});

describe("toggleItemCompletion", () => {
  it("round-trips an open item through done and back to active", () => {
    const completed = toggleItemCompletion(lifecycle({ status: "active" }), now);
    expect(completed.status).toBe("done");

    const reopened = toggleItemCompletion(
      lifecycle({ status: completed.status, completedAt: completed.completedAt }),
      now,
    );
    expect(reopened.status).toBe("active");
    expect(reopened.completedAt).toBeNull();
  });
});

describe("resolveTriagedStatus", () => {
  it("moves untriaged items out of the inbox", () => {
    expect(resolveTriagedStatus("inbox", undefined)).toBe("active");
  });

  it("leaves already-triaged items alone", () => {
    expect(resolveTriagedStatus("someday", undefined)).toBe("someday");
    expect(resolveTriagedStatus("done", undefined)).toBe("done");
  });

  it("honours an explicit request", () => {
    expect(resolveTriagedStatus("inbox", "someday")).toBe("someday");
  });
});
