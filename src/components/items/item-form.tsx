"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  ITEM_KIND_LABELS,
  ITEM_KINDS,
  ITEM_STATUS_LABELS,
  ITEM_STATUSES,
  type ItemWithRelations,
} from "@/domain/items/item";
import { MAX_TAGS_PER_ITEM } from "@/domain/items/item-schema";
import { deleteItemAction, updateItemAction } from "@/server/actions/item-actions";

/**
 * The full editor for an item.
 *
 * Creation deliberately has no form: everything is created by capture and given
 * detail afterwards. One creation path means one place for the rules to live.
 */
export function ItemForm({
  item,
  projects,
}: {
  item: ItemWithRelations;
  projects: readonly { id: string; name: string }[];
}) {
  const [state, formAction, isSaving] = useActionState(updateItemAction, null);
  const [isDeleting, startDeleting] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) toast.success("Saved.");
  }, [state]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !state.fieldErrors ? state.error : null;

  function remove() {
    startDeleting(async () => {
      const result = await deleteItemAction(item.id);
      if (result.ok) {
        toast.success("Deleted.");
        router.push("/inbox");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-6">
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="id" value={item.id} />

        <Field label="Title" htmlFor="title" errors={fieldErrors?.title}>
          <Input id="title" name="title" defaultValue={item.title} required maxLength={280} />
        </Field>

        <Field label="Notes" htmlFor="body" errors={fieldErrors?.body}>
          <Textarea id="body" name="body" defaultValue={item.body ?? ""} rows={5} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="kind" errors={fieldErrors?.kind}>
            <Select id="kind" name="kind" defaultValue={item.kind}>
              {ITEM_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {ITEM_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor="status" errors={fieldErrors?.status}>
            <Select id="status" name="status" defaultValue={item.status}>
              {ITEM_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ITEM_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Due" htmlFor="dueOn" errors={fieldErrors?.dueOn}>
            <Input id="dueOn" name="dueOn" type="date" defaultValue={item.dueOn ?? ""} />
          </Field>

          <Field label="Project" htmlFor="projectId" errors={fieldErrors?.projectId}>
            <Select id="projectId" name="projectId" defaultValue={item.projectId ?? "none"}>
              <option value="none">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Tags"
          htmlFor="tags"
          hint={`Space or comma separated. Up to ${MAX_TAGS_PER_ITEM}.`}
          errors={fieldErrors?.tags}
        >
          <Input
            id="tags"
            name="tags"
            defaultValue={item.tags.map((tag) => tag.name).join(" ")}
            placeholder="home errand"
          />
        </Field>

        {formError ? (
          <p role="alert" className="text-destructive text-sm">
            {formError}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>

      <div className="border-border flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
        <p className="text-muted-foreground text-sm">
          Deleting is permanent. Archiving keeps it out of the way instead.
        </p>
        <Button variant="danger" size="sm" onClick={remove} disabled={isDeleting}>
          <Trash2 aria-hidden />
          Delete
        </Button>
      </div>
    </div>
  );
}
