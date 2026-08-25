"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/action-result";

/**
 * Running a server action from the UI.
 *
 * Item rows, keyboard triage and kitchen inventory all mutate through actions,
 * and all owe the user the same promise: the change is optimistic where it can
 * be, and a failure is always visible. Keeping that in one place is what stops
 * them drifting into different failure behaviour.
 */
export function useAction() {
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
