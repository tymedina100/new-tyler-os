import { describe, expect, it } from "vitest";
import {
  assertMobileWorkerCredential,
  mobileRuntimePreparationAction,
} from "./mobile-runtime-preparation";

describe("mobile runtime credential boundary", () => {
  it("accepts generated-format credentials and empty fleet preparation", () => {
    const token = "tylrt_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
    expect(assertMobileWorkerCredential(token)).toBe(token);
    expect(mobileRuntimePreparationAction(null, null, [], [])).toBe("create");
  });
  it.each([
    "",
    "tylrt_" + "a".repeat(43),
    "tylrt_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG\n",
    "tym1_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    "tylrt_abcdefghijklmnopqrstuvwxyz0123456789ABCDE+G",
  ])("refuses malformed or trivially weak credentials", (token) => {
    expect(() => assertMobileWorkerCredential(token)).toThrow(/generated 256-bit/);
  });
});
