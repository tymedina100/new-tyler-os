CREATE TYPE "public"."recurrence_frequency" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TABLE "item_recurrence" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"frequency" "recurrence_frequency" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"anchor_on" date NOT NULL,
	"last_completed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_recurrence_interval_check" CHECK ("item_recurrence"."interval" >= 1 and "item_recurrence"."interval" <= 99)
);
--> statement-breakpoint
ALTER TABLE "item_recurrence" ADD CONSTRAINT "item_recurrence_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;