"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type Project } from "@/domain/projects/project";
import {
  createProjectAction,
  deleteProjectAction,
  updateProjectAction,
} from "@/server/actions/project-actions";

/**
 * Creates a project when given none, edits one when given a project.
 *
 * The two forms differ by a hidden id and a status field, which is not enough
 * difference to justify two components.
 */
export function ProjectForm({ project }: { project?: Project }) {
  const [state, formAction, isSaving] = useActionState(
    project ? updateProjectAction : createProjectAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!state?.ok) return;

    if (project) {
      toast.success("Project saved.");
    } else {
      toast.success("Project created.");
      formRef.current?.reset();
    }
  }, [state, project]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !state.fieldErrors ? state.error : null;

  return (
    <div className="grid gap-4">
      <form ref={formRef} action={formAction} className="grid gap-4">
        {project ? <input type="hidden" name="id" value={project.id} /> : null}

        <Field label="Name" htmlFor="name" errors={fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            defaultValue={project?.name ?? ""}
            placeholder="Kitchen refresh"
            required
            maxLength={120}
          />
        </Field>

        <Field label="Description" htmlFor="description" errors={fieldErrors?.description}>
          <Textarea
            id="description"
            name="description"
            defaultValue={project?.description ?? ""}
            rows={3}
          />
        </Field>

        {project ? (
          <Field label="Status" htmlFor="status" errors={fieldErrors?.status}>
            <Select id="status" name="status" defaultValue={project.status}>
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="status" value="active" />
        )}

        {formError ? (
          <p role="alert" className="text-destructive text-sm">
            {formError}
          </p>
        ) : null}

        <div>
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? "Saving…" : project ? "Save project" : "Create project"}
          </Button>
        </div>
      </form>

      {project ? (
        <DeleteProject project={project} onDeleted={() => router.push("/projects")} />
      ) : null}
    </div>
  );
}

/**
 * Two-step rather than a confirm dialog: deleting a project is irreversible, and
 * a single misplaced click should not be enough to do it.
 */
function DeleteProject({ project, onDeleted }: { project: Project; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, startDeleting] = useTransition();

  function remove() {
    startDeleting(async () => {
      const result = await deleteProjectAction(project.id);
      if (result.ok) {
        toast.success("Project deleted. Its items were kept.");
        onDeleted();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
      <p className="text-muted-foreground text-sm">
        Deleting the project keeps its items; they simply lose their project.
      </p>

      {confirming ? (
        <div className="flex gap-2">
          <Button variant="danger" size="sm" onClick={remove} disabled={isDeleting}>
            {isDeleting ? "Deleting…" : "Confirm delete"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </div>
      ) : (
        <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
          Delete project
        </Button>
      )}
    </div>
  );
}
