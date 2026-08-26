"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  startTransition,
  useActionState,
  useEffect,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { ItemFields } from "@/components/items/item-fields";
import { Button } from "@/components/ui/button";
import type { ItemWithRelations } from "@/domain/items/item";
import { deleteItemAction, updateItemAction } from "@/server/actions/item-actions";
import type { IsoDate } from "@/domain/shared/date";

/**
 * The full editor for an item.
 *
 * Creation deliberately has no form: everything is created by capture and given
 * detail afterwards. One creation path means one place for the rules to live.
 *
 * Three states are kept apart on purpose, because collapsing them is what made
 * saved edits disappear (see 0.4.1 in docs/VERIFICATION.md):
 *
 *   - the **persisted snapshot** — `snapshot`, the server values the draft was
 *     seeded from
 *   - the **local draft** — the fields themselves, owned by `ItemFields`
 *   - **whether the draft has moved since the last save began** — `dirty`
 *
 * A newly persisted snapshot is adopted only when the draft is clean. A dirty
 * draft always wins, because the user's unsaved keystrokes are the only thing
 * here that cannot be recovered from the database.
 */
export function ItemForm({
  item,
  projects,
  today,
}: {
  item: ItemWithRelations;
  projects: readonly { id: string; name: string }[];
  /** From the server, so the repeat preview cannot disagree about the date. */
  today: IsoDate;
}) {
  const [state, formAction, isSaving] = useActionState(updateItemAction, null);
  const [isDeleting, startDeleting] = useTransition();
  const router = useRouter();

  const [snapshot, setSnapshot] = useState(item);
  // Remounting `ItemFields` is how a draft is discarded and re-seeded, so this
  // counter is the identity of "which persisted snapshot the draft came from".
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [dirty, setDirty] = useState(false);

  // A state adjustment during render, not an effect: adopting in an effect would
  // paint the stale draft once first. The same pattern the capture bar uses to
  // clear itself after a successful capture.
  //
  // Signatures rather than object identity, because every revalidation anywhere
  // in the app hands this component a brand new `item` object. Comparing values
  // means an unrelated save elsewhere cannot remount a form somebody is looking
  // at, and a real change to this item still re-seeds it.
  if (!dirty && persistedSignature(item) !== persistedSignature(snapshot)) {
    setSnapshot(item);
    setDraftGeneration((generation) => generation + 1);
  }

  useEffect(() => {
    if (state?.ok) toast.success("Saved.");
  }, [state]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !state.fieldErrors ? state.error : null;

  /**
   * React 19 resets a form submitted through its `action` prop the moment the
   * action resolves — `recursivelyResetForms` calls a raw DOM `form.reset()`,
   * which knows nothing about what has been typed in the second or so the save
   * took. That wiped in-flight edits and desynced the controlled repeat select
   * from React's own state.
   *
   * Preventing the default is what turns it off: React then dispatches with a
   * null action and skips `requestFormReset` entirely. The `action` prop stays
   * on the form so a submit before hydration is still a plain server-action
   * POST.
   */
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setDirty(false);
    startTransition(() => formAction(formData));
  }

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
      <form
        action={formAction}
        onSubmit={save}
        // One listener for the whole form: any field moving marks the draft
        // dirty, and nothing downstream has to remember to report it.
        onChange={() => {
          if (!dirty) setDirty(true);
        }}
        className="grid gap-4"
      >
        <input type="hidden" name="id" value={item.id} />

        <ItemFields
          key={draftGeneration}
          item={snapshot}
          projects={projects}
          today={today}
          fieldErrors={fieldErrors}
        />

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

/**
 * The editable fields of an item, flattened for comparison.
 *
 * Only what this form can change: a `updatedAt` that moved because something
 * else touched the row is not a reason to throw away what is on screen.
 */
function persistedSignature(item: ItemWithRelations): string {
  return JSON.stringify([
    item.title,
    item.body,
    item.kind,
    item.status,
    item.dueOn,
    item.projectId,
    item.tags.map((tag) => tag.name),
    item.recurrence?.frequency ?? null,
    item.recurrence?.interval ?? null,
  ]);
}
