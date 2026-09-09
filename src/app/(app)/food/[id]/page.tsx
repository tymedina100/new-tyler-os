import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { getConsumptionEntry } from "@/server/consumption/consumption-service";
import { EntryControls } from "@/components/consumption/entry-controls";
export const dynamic = "force-dynamic";
export default async function FoodEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const entry = await getConsumptionEntry(getDb(), id);
  if (!entry) notFound();
  return (
    <article className="mx-auto grid max-w-3xl gap-4">
      <Link href="/food" className="text-muted-foreground text-sm">
        Food & drink history
      </Link>
      <h1 className="text-2xl font-semibold break-words">{entry.description}</h1>
      <p>
        {entry.kind} · {entry.loggedOn}
        {entry.voidedAt ? " · Removed (not counted)" : ""}
      </p>
      <p>{entry.feedback ? `Your feedback: ${entry.feedback}` : "No feedback recorded."}</p>
      <EntryControls id={entry.id} feedback={entry.feedback} removed={entry.voidedAt !== null} />
    </article>
  );
}
