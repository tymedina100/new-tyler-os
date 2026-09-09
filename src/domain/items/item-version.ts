import { DomainError } from "@/domain/shared/errors";

export function assertItemVersion(actual: Date, expected: string): void {
  if (actual.getTime() !== Date.parse(expected)) {
    throw new DomainError(
      "conflict",
      "This item changed elsewhere. Your draft has not been saved. Reload the latest item before editing again.",
    );
  }
}
