import { DomainError } from "@/domain/shared/errors";
import type { AiExecutionProfile } from "./ai-profile";

export function assertAiProfileEnabled(profile: Pick<AiExecutionProfile, "enabled" | "key">): void {
  if (!profile.enabled) {
    throw new DomainError("invalid_transition", `AI execution profile ${profile.key} is disabled.`);
  }
}

export function assertExplicitAiProfileId(
  profileId: string | null | undefined,
): asserts profileId is string {
  if (typeof profileId !== "string" || profileId.trim().length === 0) {
    throw new DomainError(
      "invalid_transition",
      "An AI Today briefing needs an explicit execution profile. TylerOS will not choose one.",
    );
  }
}
