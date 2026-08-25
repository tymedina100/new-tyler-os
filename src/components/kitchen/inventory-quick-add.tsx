"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import {
  COMMON_UNITS,
  KITCHEN_LOCATION_LABELS,
  KITCHEN_LOCATIONS,
  type KitchenLocation,
} from "@/domain/kitchen/inventory";
import { addInventoryItemAction } from "@/server/actions/inventory-actions";

/**
 * Adding something to the kitchen, in one row.
 *
 * An inventory is only worth keeping if updating it is easier than ignoring it,
 * so this sits permanently at the top of the page rather than behind a button
 * that opens a dialog. Name and location are the only requirements; the rest is
 * there when it matters and skipped when it does not.
 *
 * Location defaults to whichever list is being looked at, because someone
 * standing at the freezer is almost certainly adding to the freezer.
 */
export function InventoryQuickAdd({
  defaultLocation,
  defaultName,
}: {
  defaultLocation: KitchenLocation;
  defaultName?: string | undefined;
}) {
  const [state, formAction, isPending] = useActionState(addInventoryItemAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Whichever location was used last wins over the tab default, so adding five
  // things to the pantry from the All view does not mean five dropdown trips.
  const [location, setLocation] = useState<KitchenLocation>(defaultLocation);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      nameRef.current?.focus();
    }
  }, [state]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const formError = state && !state.ok && !state.fieldErrors ? state.error : null;
  const firstError = formError ?? fieldErrors?.name?.[0] ?? fieldErrors?.quantity?.[0] ?? null;

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-label="Add to the kitchen"
      // Two columns on a phone rather than five stacked rows: this sits above
      // the list, and every row it costs is a row of food pushed off-screen
      // while someone is standing at an open fridge.
      className="border-border bg-card mb-4 grid grid-cols-2 gap-2 rounded-lg border p-2.5 sm:grid-cols-[minmax(0,1fr)_5rem_6rem_7rem_auto] sm:items-center"
    >
      <Input
        ref={nameRef}
        className="col-span-2 sm:col-span-1"
        name="name"
        defaultValue={defaultName ?? ""}
        placeholder="Add to the kitchen…"
        aria-label="Name"
        aria-invalid={fieldErrors?.name ? true : undefined}
        autoComplete="off"
        maxLength={120}
      />

      <Input
        name="quantity"
        type="text"
        inputMode="decimal"
        placeholder="Qty"
        aria-label="Quantity"
        aria-invalid={fieldErrors?.quantity ? true : undefined}
        autoComplete="off"
      />

      <Input
        name="unit"
        list="kitchen-units"
        placeholder="Unit"
        aria-label="Unit"
        autoComplete="off"
        maxLength={24}
      />
      <datalist id="kitchen-units">
        {COMMON_UNITS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>

      <Select
        name="location"
        aria-label="Location"
        value={location}
        onChange={(event) => setLocation(event.target.value as KitchenLocation)}
      >
        {KITCHEN_LOCATIONS.map((value) => (
          <option key={value} value={value}>
            {KITCHEN_LOCATION_LABELS[value]}
          </option>
        ))}
      </Select>

      <Button type="submit" variant="primary" disabled={isPending}>
        <Plus aria-hidden />
        {isPending ? "Adding" : "Add"}
      </Button>

      {firstError ? (
        <p role="alert" className="text-destructive col-span-2 px-1 text-xs sm:col-span-5">
          {firstError}
        </p>
      ) : null}
    </form>
  );
}
