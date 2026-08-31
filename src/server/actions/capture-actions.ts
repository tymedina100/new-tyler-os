"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { matchNotePrefix } from "@/domain/capture/note-prefix";
import { captureItemSchema } from "@/domain/items/item-schema";
import { captureNoteSchema } from "@/domain/notes/note-schema";
import { type ActionResult, runAction } from "@/server/action-result";
import { getDb } from "@/server/db/client";
import * as itemService from "@/server/items/item-service";
import * as noteService from "@/server/notes/note-service";
import { runSuggestionPass } from "@/server/suggestions/suggestion-run";

/**
 * The one capture box's server action.
 *
 * There is exactly one capture surface in TylerOS — the header bar, the
 * command palette, and every "Capture into…" on a project page all end up
 * here. Two record types can come out of it: an ordinary item, or a note,
 * decided **before either service runs** by
 * `src/domain/capture/note-prefix.ts`'s deterministic `note:` prefix —
 * nothing AI-shaped, nothing that could turn one ordinary capture into a note
 * by accident. See docs/DECISIONS.md ADR 033.
 *
 * Everything below the branch for the item path is unchanged from before
 * notes existed: `captureItem` still resolves `@project`/`#tag`/dates/repeats
 * through `parseCapture`, and the suggestion pass still runs from `after()`
 * so Enter never waits on a model. The note path never calls `after()` at
 * all — a note is never classified or summarised (ADR 033, section 20).
 */
export async function captureAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("capture", async () => {
    const text = String(formData.get("text") ?? "");
    const noteBody = matchNotePrefix(text);

    if (noteBody !== null) {
      const input = captureNoteSchema.parse({ body: noteBody });
      const id = await noteService.captureNote(getDb(), input);
      revalidatePath("/", "layout");
      return { id };
    }

    const input = captureItemSchema.parse({
      text,
      projectId: formData.get("projectId"),
    });

    const id = await itemService.captureItem(getDb(), input);
    revalidatePath("/", "layout");

    // Scheduled, not awaited — see the identical comment this replaced in
    // item-actions.ts before capture routing moved here. Never reached for a
    // note: captureNote returns above this line.
    after(() => runSuggestionPass(getDb(), id));

    return { id };
  });
}
