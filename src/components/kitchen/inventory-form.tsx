"use client";

import { Trash2, Utensils } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  COMMON_UNITS,
  type InventoryItem,
  KITCHEN_LOCATION_LABELS,
  KITCHEN_LOCATIONS,
} from "@/domain/kitchen/inventory";
import {
  deleteInventoryItemAction,
  updateInventoryItemAction,
  markUsedUpAction,
} from "@/server/actions/inventory-actions";

/**
 * The full editor for one thing in the kitchen.
 *
 * Everything except the name and the location can be emptied again: an item
 * whose quantity you no longer know is better recorded as unknown than as a
 * number you made up.
 */
export function InventoryForm({ item }: { item: InventoryItem }) {
  const [state, formAction, isSaving] = useActionState(updateInventoryItemAction, null);
  const [isRemoving, startRemoving] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) toast.success("Saved.");
  }, [state]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !state.fieldErrors ? state.error : null;

  function remove() {
    startRemoving(async () => {
      const result = await deleteInventoryItemAction(item.id);
      if (result.ok) {
        toast.success("Deleted.");
        router.push("/kitchen");
      } else {
        toast.error(result.error);
      }
    });
  }

  function useItUp() {
    startRemoving(async () => {
      const result = await markUsedUpAction(item.id);
      if (result.ok) {
        toast.success(`Used up. ${result.data.name} is on the shopping list.`);
        router.push("/kitchen");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-6">
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="id" value={item.id} />

        <Field label="Name" htmlFor="name" errors={fieldErrors?.name}>
          <Input id="name" name="name" defaultValue={item.name} maxLength={120} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Quantity"
            htmlFor="quantity"
            hint="Leave blank if you have not counted."
            errors={fieldErrors?.quantity}
          >
            <Input
              id="quantity"
              name="quantity"
              type="text"
              inputMode="decimal"
              defaultValue={item.quantity ?? ""}
            />
          </Field>

          <Field label="Unit" htmlFor="unit" errors={fieldErrors?.unit}>
            <Input
              id="unit"
              name="unit"
              list="kitchen-units-edit"
              defaultValue={item.unit ?? ""}
              maxLength={24}
            />
            <datalist id="kitchen-units-edit">
              {COMMON_UNITS.map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>
          </Field>

          <Field label="Location" htmlFor="location" errors={fieldErrors?.location}>
            <Select id="location" name="location" defaultValue={item.location}>
              {KITCHEN_LOCATIONS.map((location) => (
                <option key={location} value={location}>
                  {KITCHEN_LOCATION_LABELS[location]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Best by" htmlFor="expiresOn" errors={fieldErrors?.expiresOn}>
          <Input id="expiresOn" name="expiresOn" type="date" defaultValue={item.expiresOn ?? ""} />
        </Field>

        <Field label="Notes" htmlFor="notes" errors={fieldErrors?.notes}>
          <Textarea id="notes" name="notes" defaultValue={item.notes ?? ""} rows={3} />
        </Field>

        {formError ? (
          <p role="alert" className="text-destructive text-sm">
            {formError}
          </p>
        ) : null}

        <div>
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>

      <div className="border-border grid gap-3 rounded-lg border p-3 sm:flex sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          Finished it? Using it up removes it here and adds it to the shopping list.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={useItUp} disabled={isRemoving}>
            <Utensils aria-hidden />
            Used it up
          </Button>
          <Button variant="danger" size="sm" onClick={remove} disabled={isRemoving}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
