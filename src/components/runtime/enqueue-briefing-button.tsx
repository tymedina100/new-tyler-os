"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enqueueTodayBriefingAction } from "@/server/actions/runtime-actions";

export function EnqueueBriefingButton() {
  const [isPending, startTransition] = useTransition();

  function enqueue() {
    startTransition(async () => {
      const result = await enqueueTodayBriefingAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Asked Miles for a Today briefing.");
    });
  }

  return (
    <Button type="button" variant="primary" size="sm" onClick={enqueue} disabled={isPending}>
      Ask Miles for a Today briefing
    </Button>
  );
}
