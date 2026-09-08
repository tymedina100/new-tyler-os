import { z } from "zod";

/**
 * Structured Miles judgment. The model never writes TylerOS markdown directly.
 * Application code renders a validated object into the note proposal.
 */

export const MAX_BRIEFING_SUMMARY_LENGTH = 400;
export const MAX_BRIEFING_BULLET_LENGTH = 160;
export const MAX_BRIEFING_BULLETS = 5;

const bullet = z.string().trim().min(1).max(MAX_BRIEFING_BULLET_LENGTH);

const bullets = z.array(bullet).max(MAX_BRIEFING_BULLETS);

export const milesJudgmentSchema = z.object({
  summary: z.string().trim().min(1).max(MAX_BRIEFING_SUMMARY_LENGTH),
  priorities: bullets,
  needsTyler: bullets,
  watch: bullets,
});
export type MilesJudgment = z.infer<typeof milesJudgmentSchema>;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function briefingDateLabel(iso: string): string {
  const [year, month, day] = iso.split("-");
  const monthIndex = Number(month) - 1;
  if (!year || monthIndex < 0 || monthIndex > 11 || !day) return iso;
  return `${Number(day)} ${MONTHS[monthIndex]} ${year}`;
}

export function parseMilesJudgment(raw: string): MilesJudgment | null {
  const body = stripCodeFence(raw).trim();
  if (body.length === 0) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch {
    return null;
  }

  const parsed = milesJudgmentSchema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

export function renderMilesBriefing(
  today: string,
  judgment: MilesJudgment,
): { title: string; body: string } {
  const title = `Today briefing — ${briefingDateLabel(today)}`;
  const sections = [
    judgment.summary,
    renderSection("Priorities", judgment.priorities),
    renderSection("Needs Tyler", judgment.needsTyler),
    renderSection("Watch", judgment.watch),
  ].filter((section) => section.length > 0);

  return { title, body: `${title}\n\n${sections.join("\n\n")}` };
}

function renderSection(heading: string, items: readonly string[]): string {
  if (items.length === 0) return "";
  return [`## ${heading}`, ...items.map((item) => `- ${item}`)].join("\n");
}

function stripCodeFence(raw: string): string {
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(raw);
  return fenced?.[1] ?? raw;
}
