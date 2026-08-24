CREATE TYPE "public"."item_kind" AS ENUM('task', 'note', 'idea', 'media', 'purchase');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('inbox', 'active', 'someday', 'done', 'archived');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'paused', 'done', 'archived');--> statement-breakpoint
CREATE TABLE "item_tags" (
	"item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "item_tags_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"kind" "item_kind" DEFAULT 'note' NOT NULL,
	"status" "item_status" DEFAULT 'inbox' NOT NULL,
	"due_on" date,
	"project_id" uuid,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("items"."title", '')), 'A') || setweight(to_tsvector('english', coalesce("items"."body", '')), 'B')) STORED
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_tags_tag_idx" ON "item_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "items_status_idx" ON "items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "items_kind_idx" ON "items" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "items_due_on_idx" ON "items" USING btree ("due_on");--> statement-breakpoint
CREATE INDEX "items_project_idx" ON "items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "items_created_at_idx" ON "items" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "items_search_idx" ON "items" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_name_unique_idx" ON "projects" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_unique_idx" ON "tags" USING btree ("name");