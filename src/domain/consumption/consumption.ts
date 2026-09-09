import { z } from "zod";
export const CONSUMPTION_KINDS = ["food", "drink"] as const;
export const consumptionInputSchema = z.object({
  kind: z.enum(CONSUMPTION_KINDS),
  description: z.string().trim().min(1, "Describe what you had.").max(1000),
});
export interface ConsumptionEntry {
  id: string;
  kind: "food" | "drink";
  description: string;
  occurredAt: Date;
  loggedOn: string;
  feedback: "like" | "dislike" | null;
  voidedAt: Date | null;
}
/** Only explicit prefixes route away from task capture; meal text is never task-parsed. */
export function matchConsumptionPrefix(text: string) {
  const match = /^\s*(food|drink):\s*([\s\S]*)$/i.exec(text);
  return match
    ? { kind: match[1]!.toLowerCase() as "food" | "drink", description: match[2]! }
    : null;
}
export function consumptionDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (kind: string) => parts.find((p) => p.type === kind)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
/** Only explicit feedback is evidence. Scope is the displayed recent history. */
export function consumptionFeedback(entries: readonly ConsumptionEntry[]) {
  const groups = new Map<string, { description: string; likes: number; dislikes: number }>();
  for (const entry of entries) {
    if (entry.voidedAt || !entry.feedback) continue;
    const key = entry.kind + ":" + entry.description.trim().toLowerCase().replace(/\s+/g, " ");
    const group = groups.get(key) ?? { description: entry.description, likes: 0, dislikes: 0 };
    if (entry.feedback === "like") group.likes++;
    else group.dislikes++;
    groups.set(key, group);
  }
  return [...groups.values()];
}
export const consumptionActionSchema = z.enum(["like", "dislike", "clear", "remove", "restore"]);
export function consumptionPatch(action: z.infer<typeof consumptionActionSchema>, now: Date) {
  if (action === "remove" || action === "restore")
    return { voidedAt: action === "remove" ? now : null };
  return { feedback: action === "clear" ? null : action };
}
