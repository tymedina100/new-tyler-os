"use server";

import { revalidatePath } from "next/cache";
import {
  captureNoteSchema,
  noteIdSchema,
  setNotePinnedSchema,
  updateNoteSchema,
} from "@/domain/notes/note-schema";
import { type ActionResult, runAction } from "@/server/action-result";
import { getDb } from "@/server/db/client";
import * as service from "@/server/notes/note-service";

/**
 * Server actions for notes.
 *
 * Same contract as everywhere else: validate with a domain schema, call a
 * service, return an ActionResult. Nothing throws at the client, and
 * `runAction` is the auth gate every action gets for free (ADR 030).
 *
 * `createNoteAction` is the Notes index's own quick-capture box — already
 * unambiguously a note, so it skips the `note:` prefix routing entirely.
 * The global capture box's `note:` prefix goes through
 * `src/server/actions/capture-actions.ts` instead, which is the one other
 * place `noteService.captureNote` is ever called from.
 */

export async function createNoteAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("createNote", async () => {
    const input = captureNoteSchema.parse({
      body: formData.get("body"),
      projectId: formData.get("projectId"),
    });
    const id = await service.captureNote(getDb(), input);
    revalidatePath("/", "layout");
    return { id };
  });
}

export async function updateNoteAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("updateNote", async () => {
    const input = updateNoteSchema.parse({
      id: formData.get("id"),
      title: formData.get("title"),
      body: formData.get("body"),
      tags: formData.get("tags"),
      projectId: formData.get("projectId"),
    });

    const id = await service.updateNote(getDb(), input);
    revalidatePath("/", "layout");
    return { id };
  });
}

export async function setNotePinnedAction(
  id: string,
  pinned: boolean,
): Promise<ActionResult<void>> {
  return runAction("setNotePinned", async () => {
    const input = setNotePinnedSchema.parse({ id, pinned });
    await service.setNotePinned(getDb(), input.id, input.pinned);
    revalidatePath("/", "layout");
  });
}

export async function deleteNoteAction(id: string): Promise<ActionResult<void>> {
  return runAction("deleteNote", async () => {
    const input = noteIdSchema.parse({ id });
    await service.deleteNote(getDb(), input.id);
    revalidatePath("/", "layout");
  });
}
