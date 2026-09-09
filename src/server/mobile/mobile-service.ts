import { matchConsumptionPrefix, consumptionInputSchema } from "@/domain/consumption/consumption";
import { logConsumption } from "@/server/consumption/consumption-service";
import { assertItemVersion } from "@/domain/items/item-version";
import * as versions from "@/server/items/item-version-repository";
import { matchNotePrefix } from "@/domain/capture/note-prefix";
import { captureItemSchema, updateItemSchema } from "@/domain/items/item-schema";
import { captureNoteSchema } from "@/domain/notes/note-schema";
import type { MobileEdit } from "@/domain/mobile/mobile-schema";
import { DomainError, NotFoundError } from "@/domain/shared/errors";
import type { Database } from "@/server/db/client";
import * as itemService from "@/server/items/item-service";
import * as noteService from "@/server/notes/note-service";
import * as runtimeService from "@/server/runtime/runtime-service";
import { hashMobileValue } from "./mobile-auth";
import * as repo from "./mobile-repository";

/** Receipt and mutation commit together; a retry with changed intent is refused. */
export async function mobileMutation(
  db: Database,
  requestId: string,
  payload: unknown,
  perform: (tx: Database) => Promise<unknown>,
) {
  const hash = hashMobileValue(JSON.stringify(payload));
  return db.transaction(async (tx) => {
    if (!(await repo.reserveMutation(tx, requestId, hash))) {
      const receipt = await repo.getReceipt(tx, requestId);
      if (!receipt || receipt.payloadHash !== hash || receipt.response === null) {
        throw new DomainError(
          "conflict",
          "This request ID was already used for a different operation.",
        );
      }
      return receipt.response;
    }
    const response = await perform(tx);
    await repo.finishMutation(tx, requestId, response);
    return response;
  });
}
export async function captureMobile(db: Database, text: string) {
  const meal = matchConsumptionPrefix(text);
  if (meal) {
    const entry = await logConsumption(db, consumptionInputSchema.parse(meal));
    return { id: entry.id, entityType: "consumption" };
  }
  const body = matchNotePrefix(text);
  if (body !== null) {
    const id = await noteService.captureNote(db, captureNoteSchema.parse({ body }));
    return { id, entityType: "note" };
  }
  const id = await itemService.captureItem(db, captureItemSchema.parse({ text }));
  return { id, entityType: "item" };
}
export async function editMobileItem(db: Database, id: string, input: MobileEdit) {
  return db.transaction(async (tx) => {
    // Lock the canonical row while checking the version and changing its state.
    const row = await versions.lockItem(tx, id);
    if (!row) throw new NotFoundError("Item", id);
    assertItemVersion(row.updatedAt, input.expectedUpdatedAt);
    const item = await itemService.getItem(tx, id);
    if (!item) throw new NotFoundError("Item", id);
    if (input.title !== undefined || input.body !== undefined || input.dueOn !== undefined) {
      const patch = updateItemSchema.parse({
        ...item,
        tags: item.tags.map((tag) => tag.name),
        title: input.title ?? item.title,
        body: input.body === undefined ? item.body : input.body,
        dueOn: input.dueOn === undefined ? item.dueOn : input.dueOn,
      });
      await itemService.updateItem(tx, patch);
    }
    // The established status use case completes one recurring occurrence.
    if (input.status !== undefined) await itemService.setItemStatus(tx, id, input.status);
    await versions.advanceItemVersion(tx, id, row.updatedAt);
    return itemService.getItem(tx, id);
  });
}
export async function decideMobileApproval(
  db: Database,
  id: string,
  decision: "accept" | "dismiss",
) {
  if (decision === "accept") await runtimeService.acceptApproval(db, id);
  else await runtimeService.dismissApproval(db, id);
  return { id, decision };
}
