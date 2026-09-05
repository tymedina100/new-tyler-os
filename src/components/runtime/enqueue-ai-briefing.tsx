"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AiExecutionProfile } from "@/domain/runtime/ai-profile";
import { AI_PROVIDER_LABELS } from "@/domain/runtime/ai-profile";
import { enqueueTodayBriefingAiAction } from "@/server/actions/runtime-actions";

export function EnqueueAiBriefing({
  profiles,
}: {
  profiles: readonly Pick<AiExecutionProfile, "id" | "name" | "provider" | "model">[];
}) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const empty = profiles.length === 0;

  function enqueue() {
    startTransition(async () => {
      const result = await enqueueTodayBriefingAiAction(profileId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Asked Miles for an AI Today briefing.");
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select
        aria-label="AI execution profile"
        className="border-border bg-card h-8 max-w-56 rounded-md border px-2 text-xs"
        disabled={empty || isPending}
        value={profileId}
        onChange={(event) => setProfileId(event.target.value)}
      >
        {empty ? (
          <option value="">No AI profiles yet</option>
        ) : (
          profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name} · {AI_PROVIDER_LABELS[profile.provider]} · {profile.model}
            </option>
          ))
        )}
      </select>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={enqueue}
        disabled={empty || isPending || profileId.length === 0}
        title={empty ? "Create an AI execution profile before asking Miles." : undefined}
      >
        Ask Miles for AI briefing
      </Button>
      {empty ? (
        <p className="text-muted-foreground w-full text-right text-xs">
          No enabled AI execution profiles. Create one with pnpm ai:profile:add — TylerOS will not
          pick a provider.
        </p>
      ) : null}
    </div>
  );
}
