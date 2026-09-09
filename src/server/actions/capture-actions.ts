"use server";
import { matchConsumptionPrefix, consumptionInputSchema } from "@/domain/consumption/consumption";
import { logConsumption } from "@/server/consumption/consumption-service";

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

/** Deterministic prefixes choose consumption or notes before task parsing.
 * These direct records never invoke the item suggestion pass (ADRs 033, 044).
 */
export async function captureAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("capture", async () => {
    const text = String(formData.get("text") ?? "");
    const meal = matchConsumptionPrefix(text);
    if (meal) {
      const entry = await logConsumption(getDb(), consumptionInputSchema.parse(meal));
      revalidatePath("/", "layout");
      return { id: entry.id };
    }
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
