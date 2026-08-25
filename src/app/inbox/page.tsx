import type { Metadata } from "next";
import { InboxTriage } from "@/components/items/inbox-triage";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { todayIsoDate } from "@/domain/shared/date";
import { getDb } from "@/server/db/client";
import { listInboxItems } from "@/server/items/item-service";

export const metadata: Metadata = { title: "Inbox" };

/**
 * The inbox is not a module. It is every item that has been captured but not
 * yet decided about, which is why triage happens with the row menu right here
 * rather than on a separate screen.
 */
export default async function InboxPage() {
  const items = await listInboxItems(getDb());
  const today = todayIsoDate(new Date());

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
        <InboxTriage items={items} today={today} />
      )}
    </>
  );
}
