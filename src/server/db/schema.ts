import { relations, sql, type SQL } from "drizzle-orm";
import {
  customType,
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ITEM_KINDS, ITEM_STATUSES } from "@/domain/items/item";
import { PROJECT_STATUSES } from "@/domain/projects/project";

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

export const projectsRelations = relations(projects, ({ many }) => ({
  items: many(items),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  project: one(projects, { fields: [items.projectId], references: [projects.id] }),
  itemTags: many(itemTags),
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
