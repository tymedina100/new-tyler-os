"use client";
import { useState, useTransition } from "react";
import { consumptionAction } from "@/server/actions/consumption-actions";
import { Button } from "@/components/ui/button";
export function EntryControls({
  id,
  feedback,
  removed,
}: {
  id: string;
  feedback: string | null;
  removed: boolean;
}) {
  const [busy, start] = useTransition(),
    [error, setError] = useState<string | null>(null);
  const choices = removed
    ? [["restore", "Restore"]]
    : [
        ["like", "Like"],
        ["dislike", "Dislike"],
        ["clear", "Clear feedback"],
        ["remove", "Remove log"],
      ];
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {choices.map(([action, label]) => (
          <Button
            key={action}
            size="sm"
            variant={feedback === action ? "primary" : "ghost"}
            disabled={busy}
            onClick={() =>
              start(async () => {
                const result = await consumptionAction(id, action!);
                setError(result.ok ? null : result.error);
              })
            }
          >
            {label}
          </Button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
