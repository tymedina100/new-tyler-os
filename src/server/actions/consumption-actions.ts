"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { consumptionActionSchema } from "@/domain/consumption/consumption";
import { runAction } from "@/server/action-result";
import { getDb } from "@/server/db/client";
import { changeConsumption } from "@/server/consumption/consumption-service";
export async function consumptionAction(id: string, action: string) {
  return runAction("consumption", async () => {
    await changeConsumption(getDb(), z.uuid().parse(id), consumptionActionSchema.parse(action));
    revalidatePath("/", "layout");
  });
}
