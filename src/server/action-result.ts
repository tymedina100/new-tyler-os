import { ZodError } from "zod";
import { isDomainError } from "@/domain/shared/errors";
import { hasValidSession } from "@/server/auth/session-cookie";

/**
 * The contract between server actions and the UI.
 *
 * Actions never throw at the client. They return a discriminated result so a
 * form can render field errors and a button can raise a toast, and so a failure
 * can never be mistaken for a success. Unexpected errors are logged with their
 * stack on the server and reduced to a neutral message for the user — logged,
 * never swallowed.
 */

export type FieldErrors = Record<string, string[]>;

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: FieldErrors };

export function actionOk(): ActionResult<undefined>;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function actionFailed(error: string, fieldErrors?: FieldErrors): ActionResult<never> {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

const UNEXPECTED_ERROR =
  "Something went wrong on the server. The details were written to the server log.";

const NOT_AUTHENTICATED_ERROR = "Your session has ended. Sign in again.";

/**
 * Wraps an action body, translating the four kinds of failure TylerOS has: no
 * session, invalid input, a broken domain rule, and everything else.
 *
 * The session check is what makes every one of the 24 actions in
 * `src/server/actions/` a protected route without any of them naming auth —
 * `src/proxy.ts` is the optimistic check that keeps an unauthenticated request
 * from ever reaching a page; this is the one Next's own authentication guide
 * says every action needs regardless, because "a page-level authentication
 * check does not extend to the Server Actions defined within it." The one
 * action that must run without a session — signing in — does not call this
 * function; see `src/server/actions/auth-actions.ts`. See ADR 030.
 */
export async function runAction<T>(
  label: string,
  body: () => Promise<T>,
): Promise<ActionResult<T>> {
  if (!(await hasValidSession(Date.now()))) {
    console.error(`[tyleros] ${label} rejected: no valid session`);
    return actionFailed(NOT_AUTHENTICATED_ERROR);
  }

  try {
    return { ok: true, data: await body() };
  } catch (error) {
    if (error instanceof ZodError) {
      const flattened = flattenIssues(error);
      return actionFailed(firstIssueMessage(error), flattened);
    }

    if (isDomainError(error)) {
      return actionFailed(error.message);
    }

    console.error(`[tyleros] ${label} failed`, error);
    return actionFailed(UNEXPECTED_ERROR);
  }
}

function flattenIssues(error: ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    const existing = fieldErrors[key];
    if (existing) {
      existing.push(issue.message);
    } else {
      fieldErrors[key] = [issue.message];
    }
  }

  return fieldErrors;
}

function firstIssueMessage(error: ZodError): string {
  return error.issues[0]?.message ?? "That input was not valid.";
}
