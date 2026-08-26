CREATE TYPE "public"."suggestion_field" AS ENUM('kind', 'project', 'tag');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'accepted', 'dismissed');--> statement-breakpoint
CREATE TABLE "item_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"field" "suggestion_field" NOT NULL,
	"kind" "item_kind",
	"project_id" uuid,
	"tag_name" text,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"model" text NOT NULL,
	"observed_title" text NOT NULL,
	"observed_value" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "item_suggestions_value_check" CHECK (("item_suggestions"."field" = 'kind' and "item_suggestions"."kind" is not null and "item_suggestions"."project_id" is null and "item_suggestions"."tag_name" is null)
       or ("item_suggestions"."field" = 'project' and "item_suggestions"."project_id" is not null and "item_suggestions"."kind" is null and "item_suggestions"."tag_name" is null)
       or ("item_suggestions"."field" = 'tag' and "item_suggestions"."tag_name" is not null and "item_suggestions"."kind" is null and "item_suggestions"."project_id" is null))
);
--> statement-breakpoint
ALTER TABLE "item_suggestions" ADD CONSTRAINT "item_suggestions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_suggestions" ADD CONSTRAINT "item_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_suggestions_one_per_field_idx" ON "item_suggestions" USING btree ("item_id","field") WHERE "item_suggestions"."field" in ('kind', 'project');--> statement-breakpoint
CREATE UNIQUE INDEX "item_suggestions_unique_tag_idx" ON "item_suggestions" USING btree ("item_id","tag_name") WHERE "item_suggestions"."field" = 'tag';--> statement-breakpoint
CREATE INDEX "item_suggestions_pending_idx" ON "item_suggestions" USING btree ("item_id") WHERE "item_suggestions"."status" = 'pending';