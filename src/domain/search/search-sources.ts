import type { ConsumptionEntry } from "@/domain/consumption/consumption";
import { ITEM_KIND_LABELS, type ItemWithRelations } from "@/domain/items/item";
import type { InventoryItem } from "@/domain/kitchen/inventory";
import { KITCHEN_LOCATION_LABELS } from "@/domain/kitchen/inventory";
import { formatQuantity } from "@/domain/kitchen/inventory-rules";
import type { NoteWithRelations } from "@/domain/notes/note";
import { buildNoteExcerpt } from "@/domain/notes/note-rules";
import type { Project } from "@/domain/projects/project";
import { PROJECT_STATUS_LABELS } from "@/domain/projects/project";
import { matchTierFor } from "@/domain/search/search-ranking";
import type { SearchHit } from "@/domain/search/search-result";
import { formatDueDate, type IsoDate } from "@/domain/shared/date";

/**
 * How each domain presents itself in a list of results.
 *
 * One small function per domain, and each one is the *only* place that knows
 * what a hit of that kind looks like. Adding a fourth searchable domain is a
 * fourth function here plus a query in its own repository — it touches no other
 * domain's internals, which is the whole point of composing at the read layer
 * rather than merging the models underneath it.
 *
 * These live in the search module rather than in each domain, exactly as
 * `src/domain/agenda/` reads items and inventory without either of them
 * learning about agendas. A projection depends on the things it projects; the
 * things do not depend on the projection. See ADR 028.
 *
 * The `href` of every hit is a page that already existed. Search sends people
 * to the canonical record and owns no destination of its own — a kitchen result
 * opens the kitchen editor, not a second inventory screen inside search.
 */

export function itemHit(item: ItemWithRelations, today: IsoDate, query: string): SearchHit {
  return {
    domain: "item",
    id: item.id,
    title: item.title,
    context: itemContext(item, today),
    href: `/items/${item.id}`,
    tier: matchTierFor(query, item.title),
  };
}

/**
 * What kind of thing it is, where it is filed, and when it is due — the three
 * things that tell two similarly-titled captures apart. Not the status, which
 * is nearly always the same for everything on screen, and not the tags, which
 * would wrap onto a second line to disambiguate almost nothing.
 */
function itemContext(item: ItemWithRelations, today: IsoDate): string | null {
  const parts = [ITEM_KIND_LABELS[item.kind]];

  if (item.project) parts.push(item.project.name);
  if (item.dueOn) parts.push(formatDueDate(item.dueOn, today));

  return parts.join(" · ");
}

export function projectHit(project: Project, query: string): SearchHit {
  return {
    domain: "project",
    id: project.id,
    title: project.name,
    context: projectContext(project),
    href: `/projects/${project.id}`,
    tier: matchTierFor(query, project.name),
  };
}

/**
 * A project's own description is what distinguishes it, when it has one. The
 * status is shown regardless, because "Kitchen" the archived project and
 * "Kitchen" the live one are the same word and a reader needs to know which
 * they are about to open.
 */
function projectContext(project: Project): string | null {
  const description = project.description?.trim();
  const parts = [PROJECT_STATUS_LABELS[project.status]];

  if (description) parts.push(description);

  return parts.join(" · ");
}

export function noteHit(note: NoteWithRelations, query: string): SearchHit {
  return {
    domain: "note",
    id: note.id,
    title: note.title,
    context: noteContext(note),
    href: `/notes/${note.id}`,
    // A note reaches here because its own SQL already matched it (title,
    // *or* body, via `searchNotes`'s tsvector). `matchTierFor` only looks at
    // the title, so a note found solely through its body correctly falls to
    // `secondary` — exactly how an item body-only match already works via
    // the identical call in `itemHit`. Pinned by
    // `tests/integration/search.test.ts`.
    tier: matchTierFor(query, note.title),
  };
}

/**
 * The project it lives in, then a taste of what it actually says — the pair
 * that tells two notes titled the same thing apart, the way an inventory
 * result is told apart by location and quantity rather than by name alone.
 */
function noteContext(note: NoteWithRelations): string | null {
  const parts: string[] = [];

  if (note.project) parts.push(note.project.name);

  const excerpt = buildNoteExcerpt(note.body);
  if (excerpt) parts.push(excerpt);

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function kitchenHit(food: InventoryItem, today: IsoDate, query: string): SearchHit {
  return {
    domain: "kitchen",
    id: food.id,
    title: food.name,
    context: kitchenContext(food, today),
    href: `/kitchen/${food.id}`,
    tier: matchTierFor(query, food.name),
  };
}

/**
 * Where it is, how much of it there is, and when it goes off.
 *
 * There is deliberately no unique constraint on an inventory name (ADR 019), so
 * two rows really can both read "Chicken breast" — the location and the date
 * are not decoration here, they are the only way to tell which packet is which.
 * That is also where the line is: enough to pick the right row, and nothing
 * that would turn search into a second place to manage the fridge.
 */
function kitchenContext(food: InventoryItem, today: IsoDate): string | null {
  const parts = [KITCHEN_LOCATION_LABELS[food.location], formatQuantity(food.quantity, food.unit)];

  if (food.expiresOn) {
    parts.push(`Best by ${formatDueDate(food.expiresOn, today)}`);
  }

  return parts.filter((part) => part.length > 0).join(" · ");
}

export function consumptionHit(entry: ConsumptionEntry, query: string): SearchHit {
  return {
    domain: "consumption",
    id: entry.id,
    title: entry.description,
    context: [entry.kind, entry.loggedOn, entry.feedback ? `Feedback: ${entry.feedback}` : null]
      .filter(Boolean)
      .join(" · "),
    href: `/food/${entry.id}`,
    tier: matchTierFor(query, entry.description),
  };
}
