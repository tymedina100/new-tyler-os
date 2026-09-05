"use server";

import { revalidatePath } from "next/cache";
import { updateCapacityRemainingSchema } from "@/domain/runtime/fleet-schema";
import { type ActionResult, runAction } from "@/server/action-result";
import { getDb } from "@/server/db/client";
import { updatePoolRemaining } from "@/server/runtime/capacity-service";

/**
 * Manual remaining update. Audited on capacity_updates. Not a scraper.
 */

export async function updateCapacityRemainingAction(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runAction("updateCapacityRemaining", async () => {
    const input = updateCapacityRemainingSchema.parse({
      poolId: String(formData.get("poolId") ?? ""),
      remaining: formData.get("remaining"),
      estimateConfidence: formData.get("estimateConfidence") || undefined,
      note: formData.get("note"),
    });
    await updatePoolRemaining(getDb(), input);
    revalidatePath("/capacity");
  });
}
