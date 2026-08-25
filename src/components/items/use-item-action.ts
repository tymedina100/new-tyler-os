"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/action-result";

/**
 * Running an item action from the UI.
 *
 * Two components now mutate items — the row's own controls and keyboard triage
 * in the inbox — and both owe the user the same promise: the change is
 * optimistic where it can be, and a failure is always visible. Keeping that in
 * one place is what stops the two drifting into different failure behaviour.
 */
export function useItemAction() {
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult<unknown>>, optimistic?: () => void): void {
    startTransition(async () => {
      optimistic?.();
      const result = await action();
      if (!result.ok) toast.error(result.error);
    });
  }

  return { isPending, run };
}
