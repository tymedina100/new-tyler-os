import { expect, it } from "vitest";
import { itemVersionSchema } from "./item-schema";
import { assertItemVersion } from "./item-version";

it("requires a real snapshot timestamp at the form boundary", () => {
  for (const value of [null, undefined, "", "yesterday", "2026-02-30T00:00:00Z"]) {
    expect(itemVersionSchema.safeParse(value).success).toBe(false);
  }
});
it("compares instants and refuses stale or invalid versions", () => {
  const actual = new Date("2026-09-09T12:00:00.123Z");
  expect(() => assertItemVersion(actual, "2026-09-09T05:00:00.123-07:00")).not.toThrow();
  for (const version of ["2026-09-09T12:00:00.122Z", "2026-09-09T12:00:00.124Z", "invalid"]) {
    expect(() => assertItemVersion(actual, version)).toThrow("changed elsewhere");
  }
});
