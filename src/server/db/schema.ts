import { relations, sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ITEM_KINDS, ITEM_STATUSES } from "@/domain/items/item";
import { KITCHEN_LOCATIONS } from "@/domain/kitchen/inventory";
import { PROJECT_STATUSES } from "@/domain/projects/project";
import { MAX_RECURRENCE_INTERVAL, RECURRENCE_FREQUENCIES } from "@/domain/recurrence/recurrence";
import { SUGGESTION_FIELDS, SUGGESTION_STATUSES } from "@/domain/suggestions/suggestion";

/**
 * The TylerOS database schema.
 *
 * Enum values are imported from the domain rather than redeclared, so the
 * database and the type system cannot drift apart.
 *
 * There is deliberately no `user_id` anywhere. TylerOS is a single-user system;
 * carrying a tenancy column would tax every query forever to serve a scenario
 * that may never arrive. Adding one later is a single migration with a single
 * backfill value. See docs/DECISIONS.md.
 */

/** Postgres full-text search vector. Drizzle has no first-class tsvector type. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

export const itemKindEnum = pgEnum("item_kind", ITEM_KINDS);
export const itemStatusEnum = pgEnum("item_status", ITEM_STATUSES);
export const projectStatusEnum = pgEnum("project_status", PROJECT_STATUSES);
export const kitchenLocationEnum = pgEnum("kitchen_location", KITCHEN_LOCATIONS);
export const recurrenceFrequencyEnum = pgEnum("recurrence_frequency", RECURRENCE_FREQUENCIES);
export const suggestionFieldEnum = pgEnum("suggestion_field", SUGGESTION_FIELDS);
export const suggestionStatusEnum = pgEnum("suggestion_status", SUGGESTION_STATUSES);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("projects_name_unique_idx").on(sql`lower(${table.name})`),
    index("projects_status_idx").on(table.status),
  ],
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    body: text("body"),
    kind: itemKindEnum("kind").notNull().default("note"),
    status: itemStatusEnum("status").notNull().default("inbox"),
    /** A calendar date, not an instant. See src/domain/shared/date.ts. */
    dueOn: date("due_on", { mode: "string" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    /**
     * Maintained by Postgres, so search can never fall out of sync with content.
     * Titles are weighted above notes: what you typed first is what you remember.
     */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${items.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${items.body}, '')), 'B')`,
    ),
  },
  (table) => [
    index("items_status_idx").on(table.status),
    index("items_kind_idx").on(table.kind),
    index("items_due_on_idx").on(table.dueOn),
    index("items_project_idx").on(table.projectId),
    index("items_created_at_idx").on(table.createdAt.desc()),
    index("items_search_idx").using("gin", table.searchVector),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Already normalised by the domain, so a plain unique index is enough. */
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("tags_name_unique_idx").on(table.name)],
);

export const itemTags = pgTable(
  "item_tags",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.tagId] }),
    index("item_tags_tag_idx").on(table.tagId),
  ],
);

/**
 * How an item repeats.
 *
 * A 1:1 extension of `items` rather than four more columns on it, which is what
 * ADR 001 said to do the moment a concept needed three or more fields of its
 * own. Most items never repeat, so those columns would be null on nearly every
 * row — and `items` has now gone two milestones without gaining one.
 *
 * There are no future occurrence rows anywhere. A schedule with no end cannot
 * be stored as rows, so occurrences are computed from `anchor_on` on demand.
 * See src/domain/recurrence/ and ADR 022.
 */
export const itemRecurrence = pgTable(
  "item_recurrence",
  {
    /** The primary key too: an item repeats one way or not at all. */
    itemId: uuid("item_id")
      .primaryKey()
      .references(() => items.id, { onDelete: "cascade" }),
    frequency: recurrenceFrequencyEnum("frequency").notNull(),
    interval: integer("interval").notNull().default(1),
    /**
     * The origin of the series. Occurrences are counted from here rather than
     * from the previous one, so a monthly repeat clamped to February 28th does
     * not drag March backwards with it.
     */
    anchorOn: date("anchor_on", { mode: "string" }).notNull(),
    /** When the most recent occurrence was actually done. One fact, not a log. */
    lastCompletedOn: date("last_completed_on", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "item_recurrence_interval_check",
      sql`${table.interval} >= 1 and ${table.interval} <= ${sql.raw(String(MAX_RECURRENCE_INTERVAL))}`,
    ),
  ],
);

/**
 * What AI proposed about an item, and what the user did about it.
 *
 * Its own table for the reason every table here has its own table: a proposal
 * is not a property of an item. `items` stays the canonical record, and nothing
 * a model produced can be read as fact by anything that queries it. This is the
 * `item_suggestions` seam docs/ARCHITECTURE.md has described since 0.1, built
 * as described — `items` has now gone three milestones without a new column.
 *
 * **One row per proposed value**, not one row per model response. That is what
 * makes partial acceptance fall out for free: "project: Home" and
 * "tag: maintenance" resolve independently, and accepting one has no opinion
 * about the other. Exactly one of `kind`, `project_id` and `tag_name` is set,
 * decided by `field` and enforced by the check below — a tagged union, not the
 * mostly-null-columns smell ADR 001 warns about.
 *
 * Deliberately not here: the prompt, the raw response, token counts, cost, a
 * request log. None of them are needed to show a suggestion or to decide
 * whether it still applies, and retaining the text of personal captures next to
 * a provider's reply is a privacy cost with no user-visible return. See ADR 027.
 */
export const itemSuggestions = pgTable(
  "item_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    field: suggestionFieldEnum("field").notNull(),
    kind: itemKindEnum("kind"),
    /**
     * Cascades rather than nulling, unlike `items.project_id`. An item outlives
     * its project; a proposal to file something into a project that no longer
     * exists is not worth keeping.
     */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    /** A name, not a tag id. Accepting is what creates the row, through `ensureTags`. */
    tagName: text("tag_name"),
    status: suggestionStatusEnum("status").notNull().default("pending"),
    /** Which model said so. For reading a server log, never shown to the user. */
    model: text("model").notNull(),
    /**
     * The title the model was shown. A retitled item is a different capture,
     * and every proposal about the old words goes stale at once.
     */
    observedTitle: text("observed_title").notNull(),
    /**
     * What this proposal's own field held at the time, with the empty string
     * meaning "nothing". Comparing it against the live item at acceptance is
     * what stops a stale suggestion undoing a newer manual choice. Per field
     * rather than per response, so accepting one proposal cannot stale its
     * siblings. See `reconcileSuggestion`.
     */
    observedValue: text("observed_value").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "item_suggestions_value_check",
      sql`(${table.field} = 'kind' and ${table.kind} is not null and ${table.projectId} is null and ${table.tagName} is null)
       or (${table.field} = 'project' and ${table.projectId} is not null and ${table.kind} is null and ${table.tagName} is null)
       or (${table.field} = 'tag' and ${table.tagName} is not null and ${table.kind} is null and ${table.projectId} is null)`,
    ),
    /**
     * Duplicate-request safety, in SQL rather than by convention.
     *
     * A retried capture, a double-invoked callback or two overlapping requests
     * all converge on the same rows instead of stacking identical proposals in
     * front of the user. The service inserts with `on conflict do nothing`, so
     * a repeat is a no-op rather than an error — and a proposal the user has
     * already dismissed can never come back to be dismissed again.
     *
     * Two partial indexes rather than one over a `coalesce` of all three value
     * columns. That was the first attempt and Postgres refuses it: casting an
     * enum to text is only STABLE, not IMMUTABLE, so it cannot appear in an
     * index expression. Splitting on `field` says the real rule more precisely
     * anyway — an item has **one** kind proposal and **one** project proposal,
     * because it has one kind and one project, while tags are a set and are
     * unique per name.
     */
    uniqueIndex("item_suggestions_one_per_field_idx")
      .on(table.itemId, table.field)
      .where(sql`${table.field} in ('kind', 'project')`),
    uniqueIndex("item_suggestions_unique_tag_idx")
      .on(table.itemId, table.tagName)
      .where(sql`${table.field} = 'tag'`),
    index("item_suggestions_pending_idx")
      .on(table.itemId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

/**
 * Notes: durable, retrievable knowledge — not a responsibility.
 *
 * Its own table, for the reason `kitchen_inventory` got one: this is not an
 * Item. An item's `body` is supporting context for something actionable and
 * dies with that item's own lifecycle; a note's primary identity is the
 * information itself, with no `status` and no `due_on` — it cannot be Done,
 * Someday, Archived, or overdue. See docs/DECISIONS.md ADR 033.
 *
 * `search_vector` mirrors `items` exactly, title weighted above body, because
 * notes are prose the same way items are (ADR 009) — this is `tsvector`, not
 * the kitchen's substring match, which exists for short product names.
 *
 * There is deliberately no unique constraint on `title`: "Mazda6 maintenance"
 * can exist twice, the same way two kitchen records can share a name
 * (ADR 019) — nothing here invents uniqueness the user did not ask for.
 */
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    /** Markdown source. Never rendered as raw HTML — see ADR 034. */
    body: text("body").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${notes.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${notes.body}, '')), 'B')`,
    ),
  },
  (table) => [
    index("notes_updated_at_idx").on(table.updatedAt.desc()),
    index("notes_project_idx").on(table.projectId),
    index("notes_search_idx").using("gin", table.searchVector),
  ],
);

export const noteTags = pgTable(
  "note_tags",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.tagId] }),
    index("note_tags_tag_idx").on(table.tagId),
  ],
);

/**
 * Kitchen inventory.
 *
 * Its own table, on purpose. A jar of olive oil is a fact about the world, not
 * something captured to act on, and cramming it into `items` would mean six
 * mostly-null columns and an inbox full of groceries. See docs/ARCHITECTURE.md.
 *
 * There is no unique constraint on `name`: two chicken packages with different
 * dates are two truthful records, and merging them would invent a fact.
 */
export const kitchenInventory = pgTable(
  "kitchen_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    location: kitchenLocationEnum("location").notNull(),
    /** Null means "some, uncounted". Zero means the food is gone. */
    quantity: numeric("quantity", { precision: 10, scale: 2, mode: "number" }),
    /** Null means a bare count. Free text, so "bottle" needs no migration. */
    unit: text("unit"),
    /** A calendar date, like every other date in TylerOS. See ADR 005. */
    expiresOn: date("expires_on", { mode: "string" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("kitchen_inventory_location_idx").on(table.location),
    index("kitchen_inventory_expires_on_idx").on(table.expiresOn),
    index("kitchen_inventory_name_idx").on(sql`lower(${table.name})`),
  ],
);

export const projectsRelations = relations(projects, ({ many }) => ({
  items: many(items),
  notes: many(notes),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  project: one(projects, { fields: [items.projectId], references: [projects.id] }),
  recurrence: one(itemRecurrence, {
    fields: [items.id],
    references: [itemRecurrence.itemId],
  }),
  itemTags: many(itemTags),
  suggestions: many(itemSuggestions),
}));

export const itemSuggestionsRelations = relations(itemSuggestions, ({ one }) => ({
  item: one(items, { fields: [itemSuggestions.itemId], references: [items.id] }),
  project: one(projects, { fields: [itemSuggestions.projectId], references: [projects.id] }),
}));

export const itemRecurrenceRelations = relations(itemRecurrence, ({ one }) => ({
  item: one(items, { fields: [itemRecurrence.itemId], references: [items.id] }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  itemTags: many(itemTags),
  noteTags: many(noteTags),
}));

export const itemTagsRelations = relations(itemTags, ({ one }) => ({
  item: one(items, { fields: [itemTags.itemId], references: [items.id] }),
  tag: one(tags, { fields: [itemTags.tagId], references: [tags.id] }),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  project: one(projects, { fields: [notes.projectId], references: [projects.id] }),
  noteTags: many(noteTags),
}));

export const noteTagsRelations = relations(noteTags, ({ one }) => ({
  note: one(notes, { fields: [noteTags.noteId], references: [notes.id] }),
  tag: one(tags, { fields: [noteTags.tagId], references: [tags.id] }),
}));

export type ItemRow = typeof items.$inferSelect;
export type NewItemRow = typeof items.$inferInsert;
export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type NoteRow = typeof notes.$inferSelect;
export type NewNoteRow = typeof notes.$inferInsert;
export type TagRow = typeof tags.$inferSelect;
export type ItemRecurrenceRow = typeof itemRecurrence.$inferSelect;
export type NewItemRecurrenceRow = typeof itemRecurrence.$inferInsert;
export type ItemSuggestionRow = typeof itemSuggestions.$inferSelect;
export type NewItemSuggestionRow = typeof itemSuggestions.$inferInsert;
export type KitchenInventoryRow = typeof kitchenInventory.$inferSelect;
export type NewKitchenInventoryRow = typeof kitchenInventory.$inferInsert;
