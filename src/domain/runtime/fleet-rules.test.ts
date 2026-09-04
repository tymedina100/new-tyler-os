import { describe, expect, it } from "vitest";
import { assertInstanceKey, assertRoleGranted } from "./fleet-rules";

describe("assertInstanceKey", () => {
  it("accepts kebab-case keys", () => {
    expect(assertInstanceKey("home-desktop-python")).toBe("home-desktop-python");
  });

  it("rejects uppercase or spaces", () => {
    expect(() => assertInstanceKey("Home Desktop")).toThrow(/kebab-case/);
  });
});

describe("assertRoleGranted", () => {
  it("allows a granted role and refuses another", () => {
    expect(() => assertRoleGranted(["miles"], "miles")).not.toThrow();
    expect(() => assertRoleGranted(["miles"], "scout")).toThrow(/not allowed to act as scout/);
  });
});
