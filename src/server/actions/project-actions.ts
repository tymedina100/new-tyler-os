"use server";

import { revalidatePath } from "next/cache";
import {
  createProjectSchema,
  projectIdSchema,
  updateProjectSchema,
} from "@/domain/projects/project-schema";
import { type ActionResult, runAction } from "@/server/action-result";
import { getDb } from "@/server/db/client";
import * as service from "@/server/projects/project-service";

export async function createProjectAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("createProject", async () => {
    const input = createProjectSchema.parse({
      name: formData.get("name"),
      description: formData.get("description"),
      status: formData.get("status") ?? "active",
    });

    const id = await service.createProject(getDb(), input);
    revalidatePath("/", "layout");
    return { id };
  });
}

export async function updateProjectAction(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction("updateProject", async () => {
    const input = updateProjectSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      description: formData.get("description"),
      status: formData.get("status"),
    });

    const id = await service.updateProject(getDb(), input);
    revalidatePath("/", "layout");
    return { id };
  });
}

/** Items outlive their project: the foreign key clears rather than cascades. */
export async function deleteProjectAction(id: string): Promise<ActionResult<void>> {
  return runAction("deleteProject", async () => {
    const input = projectIdSchema.parse({ id });
    await service.deleteProject(getDb(), input.id);
    revalidatePath("/", "layout");
  });
}
