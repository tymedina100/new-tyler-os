import { relations, sql, type SQL } from "drizzle-orm";
import {
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
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  project: one(projects, { fields: [items.projectId], references: [projects.id] }),
  recurrence: one(itemRecurrence, {
    fields: [items.id],
    references: [itemRecurrence.itemId],
  }),
  itemTags: many(itemTags),
}));

export const itemRecurrenceRelations = relations(itemRecurrence, ({ one }) => ({
  item: one(items, { fields: [itemRecurrence.itemId], references: [items.id] }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  itemTags: many(itemTags),
}));

export const itemTagsRelations = relations(itemTags, ({ one }) => ({
  item: one(items, { fields: [itemTags.itemId], references: [items.id] }),
  tag: one(tags, { fields: [itemTags.tagId], references: [tags.id] }),
}));

export type ItemRow = typeof items.$inferSelect;
export type NewItemRow = typeof items.$inferInsert;
export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type TagRow = typeof tags.$inferSelect;
export type ItemRecurrenceRow = typeof itemRecurrence.$inferSelect;
export type NewItemRecurrenceRow = typeof itemRecurrence.$inferInsert;
export type KitchenInventoryRow = typeof kitchenInventory.$inferSelect;
export type NewKitchenInventoryRow = typeof kitchenInventory.$inferInsert;
