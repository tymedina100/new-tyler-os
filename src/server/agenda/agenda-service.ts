import type { Agenda } from "@/domain/agenda/agenda";
import { AGENDA_WINDOW_DAYS, buildAgenda } from "@/domain/agenda/agenda";
import type { ItemWithRelations } from "@/domain/items/item";
import type { InventoryItem } from "@/domain/kitchen/inventory";
import { addDays, type IsoDate, todayIsoDate } from "@/domain/shared/date";
import type { Database } from "@/server/db/client";
import { listAgendaCandidates } from "@/server/items/item-repository";
import { listExpiringThrough } from "@/server/kitchen/inventory-repository";

/**
 * Reading the coming fortnight across every domain that has dates.
 *
 * Its own service rather than a method on either side, because it belongs to
 * neither: it reads from the item repository and the kitchen repository and
 * hands both to a pure projection. Putting it in `item-service` would make the
 * spine responsible for knowing what is in the fridge, which is precisely the
 * coupling ADR 019 kept out of the schema.
 *
 * It starts **tomorrow**. Today already has a screen, and a view that repeats it
 * is a view nobody reads twice.
 */

export interface AgendaData {
  today: IsoDate;
  agenda: Agenda<ItemWithRelations, InventoryItem>;
}

export async function getAgendaData(db: Database, now = new Date()): Promise<AgendaData> {
  const today = todayIsoDate(now);
  const from = addDays(today, 1);
  const to = addDays(from, AGENDA_WINDOW_DAYS - 1);

  const [items, expiring] = await Promise.all([
    listAgendaCandidates(db, from, to),
    listExpiringThrough(db, to),
  ]);

  return { today, agenda: buildAgenda({ items, expiring }, { from, days: AGENDA_WINDOW_DAYS }) };
}
