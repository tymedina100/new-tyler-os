"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { CAPACITY_CONFIDENCE_LABELS, type CapacityPool } from "@/domain/runtime/capacity";
import { updateCapacityRemainingAction } from "@/server/actions/capacity-actions";

export function CapacityRemainingForm({ pool }: { pool: CapacityPool }) {
  const [state, formAction, isPending] = useActionState(updateCapacityRemainingAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) toast.success("Remaining updated.");
    if (state && !state.ok) toast.error(state.error);
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="poolId" value={pool.id} />
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Remaining</span>
        <Input
          name="remaining"
          type="number"
          step="any"
          min="0"
          defaultValue={pool.remaining ?? ""}
          className="h-8 w-28"
          required
        />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Confidence</span>
        <select
          name="estimateConfidence"
          defaultValue={pool.estimateConfidence}
          className="border-input bg-card h-8 rounded-md border px-2 text-sm"
        >
          {Object.entries(CAPACITY_CONFIDENCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid min-w-40 flex-1 gap-1 text-xs">
        <span className="text-muted-foreground">Note</span>
        <Input name="note" placeholder="Why this number" className="h-8" />
      </label>
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Saving…" : "Record"}
      </Button>
    </form>
  );
}
