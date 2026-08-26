import { aiConfig } from "@/server/ai/ai-config";
import type { Classifier } from "@/server/ai/classify-capture";
import { classifyCapture } from "@/server/ai/classify-capture";
import type { Database } from "@/server/db/client";
import { suggestForItem, type SuggestionRunOutcome } from "./suggestion-service";

/**
 * The entry point capture uses, and the only place a suggestion failure is
 * allowed to end.
 *
 * Two jobs, both about containment:
 *
 *   1. **Nothing escapes.** This never throws and never returns a failure worth
 *      acting on. It is scheduled with `after()`, so it runs once the capture
 *      response has already been sent — there is no user waiting on it and no
 *      screen for an error to appear on. An optional suggestion that fell over
 *      must look, from every direction, exactly like one that was never asked
 *      for.
 *   2. **It says what happened, safely.** This is TylerOS's first
 *      non-deterministic subsystem, and a subsystem that fails invisibly is one
 *      nobody can fix.
 *
 * ## What is logged, and what is deliberately not
 *
 * Logged: that a pass ran, what it concluded, how long it took, and which model
 * answered. Every failure value is a fixed category from a closed union, so
 * there is no path by which a provider's error text reaches a log file.
 *
 * Not logged: the API key, any header, the prompt, the response body, the
 * captured text, or the item's contents. The item id is included because it is
 * the only way to correlate a run with a row, and it is an opaque uuid that
 * says nothing about a person's life on its own.
 *
 * The captured title in particular is never written here. It is the most
 * sensitive thing this subsystem touches, and a log line is the easiest place
 * for personal text to end up somewhere nobody meant it to be.
 */
export async function runSuggestionPass(
  db: Database,
  itemId: string,
  classify: Classifier = classifyCapture,
  now = new Date(),
): Promise<void> {
  // Checked before anything is loaded, so an unconfigured TylerOS does not do a
  // database round trip per capture to discover that AI is still off. This is
  // also the silent path: nothing is logged, because nothing was expected.
  if (!aiConfig().enabled) return;

  const startedAt = performance.now();

  try {
    report(itemId, await suggestForItem(db, itemId, classify, now), startedAt);
  } catch (error) {
    // Never swallowed, and never propagated either: `after()` has no caller to
    // return to. Logged with its stack, which is the same contract `runAction`
    // holds for an unexpected failure.
    console.error(`[tyleros] suggestion pass failed for item ${itemId}`, error);
  }
}

function report(itemId: string, outcome: SuggestionRunOutcome, startedAt: number): void {
  const ms = Math.round(performance.now() - startedAt);
  const detail =
    outcome.status === "stored"
      ? `stored ${outcome.count}`
      : outcome.status === "skipped"
        ? `skipped: ${outcome.reason}`
        : `failed: ${outcome.failure}`;

  // `console.warn` rather than `log`: the lint rule allows warn and error, and
  // this is the kind of line somebody only reads when something looks wrong.
  console.warn(`[tyleros] suggestion ${itemId} ${detail} (${ms}ms)`);
}
