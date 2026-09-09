import { addDays, addMonths, isIsoDate, todayIsoDate } from "@/domain/shared/date";
import type { KnowledgeEntry } from "./knowledge";

export interface SnapshotHealth {
  status: "available" | "not_configured" | "unavailable";
  message: string;
}

/** Import age describes the cache, never whether the original is current. */
export function importAge(importedAt: string, now: Date): string {
  const elapsed = now.getTime() - Date.parse(importedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "Import timestamp is unverified";
  const days = Math.floor(elapsed / 86_400_000);
  return days === 0
    ? "Imported less than a day ago"
    : `Imported ${days} day${days === 1 ? "" : "s"} ago`;
}

export function knowledgeSourceHealth(entry: KnowledgeEntry, now: Date) {
  const reviewed = entry.lastReviewed;
  const today = todayIsoDate(now);
  let reviewDueOn: string | null = null;
  if (reviewed && isIsoDate(reviewed) && reviewed <= today) {
    switch (entry.freshness.trim().toLowerCase()) {
      case "daily":
        reviewDueOn = addDays(reviewed, 1);
        break;
      case "weekly":
        reviewDueOn = addDays(reviewed, 7);
        break;
      case "monthly":
        reviewDueOn = addMonths(reviewed, 1);
        break;
      case "quarterly":
        reviewDueOn = addMonths(reviewed, 3);
        break;
      case "yearly":
      case "annually":
        reviewDueOn = addMonths(reviewed, 12);
        break;
    }
  }
  const reviewStatus = reviewDueOn === null ? "unknown" : reviewDueOn <= today ? "due" : "not_due";
  const reviewMessage =
    reviewDueOn === null
      ? "Review timing unverified. Check the source in Notion."
      : reviewStatus === "due"
        ? `Review due since ${reviewDueOn}. Check the source in Notion.`
        : `Next recorded review due ${reviewDueOn}. Source changes are not synced live.`;
  return {
    importMessage: importAge(entry.importedAt, now),
    reviewStatus,
    reviewDueOn,
    reviewMessage,
  };
}
