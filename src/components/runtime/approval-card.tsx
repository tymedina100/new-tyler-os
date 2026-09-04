"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { NoteMarkdown } from "@/components/notes/note-markdown";
import { Button } from "@/components/ui/button";
import { APPROVAL_KIND_LABELS, type Approval } from "@/domain/runtime/runtime";
import { acceptApprovalAction, dismissApprovalAction } from "@/server/actions/runtime-actions";

/**
 * A proposed side effect. Dashed, like item suggestions: this is not yet
 * a note, and accepting is what makes it one.
 */
export function ApprovalCard({ approval }: { approval: Approval }) {
  const [isPending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const result = await acceptApprovalAction(approval.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved as a note.");
    });
  }

  function dismiss() {
    startTransition(async () => {
      const result = await dismissApprovalAction(approval.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Dismissed. No note was created.");
    });
  }

  return (
    <div className="border-border/70 grid gap-3 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[0.6875rem] font-medium">
            Proposed · {APPROVAL_KIND_LABELS[approval.kind]}
          </p>
          <p className="text-sm font-medium">{approval.title}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="primary" size="sm" onClick={accept} disabled={isPending}>
            Accept
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={isPending}>
            Dismiss
          </Button>
        </div>
      </div>
      <NoteMarkdown body={approval.body} />
    </div>
  );
}
