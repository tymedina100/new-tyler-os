/**
 * Domain errors.
 *
 * Domain code throws when an invariant is violated; it never returns a silent
 * failure and never swallows one. The server layer translates these into
 * user-facing action results (see src/server/action-result.ts).
 */

export type DomainErrorCode = "invalid_transition" | "not_found" | "validation_failed" | "conflict";

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super("not_found", `${entity} ${id} was not found.`);
    this.name = "NotFoundError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
