import { describe, expect, it } from "vitest";
import {
  kindsForFilter,
  matchesItemFilters,
  parseKindFilter,
  parseStatusFilter,
  statusesForFilter,
} from "./item-filters";

const item = {
  kind: "task" as const,
  status: "active" as const,
  projectId: "b1f0d0b6-2c9d-4f9c-9b2a-0f0a1c2d3e4f",
  tags: [{ id: "t1", name: "home" }],
};

describe("matchesItemFilters", () => {
  it("matches when nothing is being filtered on", () => {
    expect(matchesItemFilters(item, {})).toBe(true);
  });

  it("filters on each axis independently", () => {
    expect(matchesItemFilters(item, { kinds: ["task"] })).toBe(true);
    expect(matchesItemFilters(item, { kinds: ["media"] })).toBe(false);
    expect(matchesItemFilters(item, { statuses: ["done"] })).toBe(false);
    expect(matchesItemFilters(item, { tagName: "home" })).toBe(true);
    expect(matchesItemFilters(item, { tagName: "errand" })).toBe(false);
  });

  it("requires every supplied filter to match", () => {
    expect(matchesItemFilters(item, { kinds: ["task"], tagName: "home" })).toBe(true);
    expect(matchesItemFilters(item, { kinds: ["task"], tagName: "errand" })).toBe(false);
  });

  it("accepts any of several kinds", () => {
    expect(matchesItemFilters(item, { kinds: ["media", "task"] })).toBe(true);
  });

  it("does not match an item with no project when a project is required", () => {
    expect(matchesItemFilters({ ...item, projectId: null }, { projectId: "x" })).toBe(false);
  });
});

describe("parseStatusFilter", () => {
  it("accepts real statuses and the two pseudo-values", () => {
    expect(parseStatusFilter("done", "open")).toBe("done");
    expect(parseStatusFilter("open", "all")).toBe("open");
    expect(parseStatusFilter("all", "open")).toBe("all");
  });

  it("falls back rather than throwing on a hand-edited URL", () => {
    expect(parseStatusFilter("nonsense", "open")).toBe("open");
    expect(parseStatusFilter(undefined, "open")).toBe("open");
  });
});

describe("statusesForFilter", () => {
  it("expands 'open' to everything still wanting attention", () => {
    expect(statusesForFilter("open")).toEqual(["inbox", "active", "someday"]);
  });

  it("returns no constraint for 'all'", () => {
    expect(statusesForFilter("all")).toBeUndefined();
  });

  it("passes a concrete status straight through", () => {
    expect(statusesForFilter("archived")).toEqual(["archived"]);
  });
});

describe("parseKindFilter", () => {
  it("keeps a valid kind and falls back otherwise", () => {
    expect(parseKindFilter("media", "task")).toBe("media");
    expect(parseKindFilter("all", "task")).toBe("all");
    expect(parseKindFilter("recipe", "task")).toBe("task");
    expect(parseKindFilter(undefined, "task")).toBe("task");
  });
});

describe("kindsForFilter", () => {
  it("returns no constraint for 'all'", () => {
    expect(kindsForFilter("all")).toBeUndefined();
    expect(kindsForFilter("task")).toEqual(["task"]);
  });
});
