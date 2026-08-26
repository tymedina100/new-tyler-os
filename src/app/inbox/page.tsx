import type { Metadata } from "next";
import { InboxTriage } from "@/components/items/inbox-triage";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { todayIsoDate } from "@/domain/shared/date";
import { getDb } from "@/server/db/client";
import { listInboxItems } from "@/server/items/item-service";
import { listPendingSuggestionsByItem } from "@/server/suggestions/suggestion-service";

export const metadata: Metadata = { title: "Inbox" };

/**
 * The inbox is not a module. It is every item that has been captured but not
 * yet decided about, which is why triage happens with the row menu right here
 * rather than on a separate screen.
 *
 * It is also where suggestions surface, and deliberately not the capture bar.
 * Capture is for getting something out of your head in one keystroke; deciding
 * what it was is a different moment, and this is the screen for that moment. A
 * proposal waiting here has cost the capture nothing.
 */
export default async function InboxPage() {
  const db = getDb();
  const items = await listInboxItems(db);
  const today = todayIsoDate(new Date());

  // One query for the whole screen rather than one per row. Empty on every
  // machine where AI is not configured, which is what makes the inbox identical
  // to 0.4.1's by default.
  const suggestions = await listPendingSuggestionsByItem(
    db,
    items.map((item) => item.id),
  );

  return (
    <>
      <PageHeader
        title="Inbox"
        description={
          items.length === 0
            ? "Everything captured has been triaged."
            : `${items.length} ${items.length === 1 ? "item" : "items"} waiting to be filed.`
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Inbox zero"
          description="Anything you capture lands here first. Give it a type or a date — from the row menu, or with a single key — and it moves on."
        />
      ) : (
        <InboxTriage items={items} today={today} suggestions={suggestions} />
      )}
    </>
  );
}
