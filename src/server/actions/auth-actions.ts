"use server";

import { actionFailed, actionOk, type ActionResult } from "@/server/action-result";
import { authConfig } from "@/server/auth/auth-config";
import { createSessionCookie, clearSessionCookie } from "@/server/auth/session-cookie";
import { passphraseMatches } from "@/server/auth/session";

/**
 * Signing in and out.
 *
 * Deliberately not wrapped in `runAction`: that helper's first line is "is
 * there a valid session", and the entire purpose of this file is to create one
 * where none exists yet. Building the result by hand, with the same
 * `actionOk`/`actionFailed` shapes every other action uses, is the one
 * documented exception to "every action goes through `runAction`" — see
 * `src/server/action-result.ts` and docs/DECISIONS.md ADR 030.
 *
 * No rate limiting on failed attempts. A process-local counter is not a real
 * boundary once more than one server instance can be running, which any
 * serverless deployment target implies — recorded as a deployment-time
 * hardening note in README.md rather than faked here.
 */

export async function signInAction(
  _previous: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  const config = authConfig();

  if (config.mode === "misconfigured") {
    return actionFailed("TylerOS is not configured. See the server log.");
  }

  if (config.mode === "open") {
    return actionFailed("No sign-in is required right now.");
  }

  const submitted = formData.get("passphrase");

  if (typeof submitted !== "string" || submitted.trim().length === 0) {
    return actionFailed("Enter the passphrase.", { passphrase: ["Enter the passphrase."] });
  }

  if (!passphraseMatches(config.passphrase, submitted.trim(), config.secret)) {
    return actionFailed("That passphrase is not correct.", {
      passphrase: ["That passphrase is not correct."],
    });
  }

  await createSessionCookie(Date.now());
  return actionOk();
}

export async function signOutAction(): Promise<ActionResult<undefined>> {
  await clearSessionCookie();
  return actionOk();
}
