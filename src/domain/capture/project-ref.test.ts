import { describe, expect, it } from "vitest";
import type { ProjectRef } from "@/domain/projects/project";
import { matchProjectRef } from "./project-ref";

const PROJECTS: ProjectRef[] = [
  { id: "p-kitchen", name: "Kitchen Refresh" },
  { id: "p-tyleros", name: "TylerOS" },
  { id: "p-media", name: "Media" },
];

describe("matchProjectRef", () => {
  it("matches a name exactly", () => {
    expect(matchProjectRef("TylerOS", PROJECTS)).toEqual({
      outcome: "matched",
      project: PROJECTS[1],
    });
  });

  it.each(["tyleros", "TYLEROS", "TylerOs"])("ignores case in %j", (ref) => {
    expect(matchProjectRef(ref, PROJECTS)).toMatchObject({ outcome: "matched" });
  });

  it.each(["kitchenrefresh", "Kitchen-Refresh", "kitchen_refresh", "Kitchen.Refresh"])(
    "ignores the punctuation standing in for a space in %j",
    (ref) => {
      expect(matchProjectRef(ref, PROJECTS)).toEqual({
        outcome: "matched",
        project: PROJECTS[0],
      });
    },
  );

  it("matches an unambiguous prefix", () => {
    expect(matchProjectRef("kitchen", PROJECTS)).toEqual({
      outcome: "matched",
      project: PROJECTS[0],
    });
  });

  it("refuses to choose between two possible prefixes", () => {
    const projects: ProjectRef[] = [
      { id: "a", name: "Money" },
      { id: "b", name: "Moving House" },
    ];
    const match = matchProjectRef("mo", projects);

    expect(match.outcome).toBe("ambiguous");
    expect(match).toMatchObject({ candidates: projects });
  });

  it("prefers an exact match over a longer name it also prefixes", () => {
    const projects: ProjectRef[] = [
      { id: "a", name: "Media" },
      { id: "b", name: "Media Backlog" },
    ];
    expect(matchProjectRef("media", projects)).toEqual({
      outcome: "matched",
      project: projects[0],
    });
  });

  it("reports an unknown reference rather than guessing", () => {
    expect(matchProjectRef("gardening", PROJECTS)).toEqual({ outcome: "unknown" });
  });

  it("treats a reference of pure punctuation as unknown", () => {
    expect(matchProjectRef("---", PROJECTS)).toEqual({ outcome: "unknown" });
  });

  it("is unknown when there are no projects at all", () => {
    expect(matchProjectRef("anything", [])).toEqual({ outcome: "unknown" });
  });
});
