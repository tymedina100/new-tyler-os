"use server";

import { revalidatePath } from "next/cache";
import { approvalIdSchema, enqueueTodayBriefingSchema } from "@/domain/runtime/runtime-schema";
import { type ActionResult, runAction } from "@/server/action-result";
import { getDb } from "@/server/db/client";
import * as service from "@/server/runtime/runtime-service";

/**
 * Human actions for the runtime board.
 *
 * Enqueueing a briefing and resolving a proposal are Tyler-facing, so they
 * go through Server Actions and `runAction` like everything else. The
 * machine poller never calls these.
 */

export async function enqueueTodayBriefingAction(): Promise<ActionResult<{ id: string }>> {
  return runAction("enqueueTodayBriefing", async () => {
    enqueueTodayBriefingSchema.parse({});
    const job = await service.enqueueTodayBriefing(getDb());
    revalidatePath("/", "layout");
    return { id: job.id };
  });
}

export async function acceptApprovalAction(id: string): Promise<ActionResult<void>> {
  return runAction("acceptApproval", async () => {
    const input = approvalIdSchema.parse({ id });
    await service.acceptApproval(getDb(), input.id);
    revalidatePath("/", "layout");
  });
}

export async function dismissApprovalAction(id: string): Promise<ActionResult<void>> {
  return runAction("dismissApproval", async () => {
    const input = approvalIdSchema.parse({ id });
    await service.dismissApproval(getDb(), input.id);
    revalidatePath("/", "layout");
  });
}
