CREATE TYPE "public"."kitchen_location" AS ENUM('fridge', 'freezer', 'pantry');--> statement-breakpoint
CREATE TABLE "kitchen_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" "kitchen_location" NOT NULL,
	"quantity" numeric(10, 2),
	"unit" text,
	"expires_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "kitchen_inventory_location_idx" ON "kitchen_inventory" USING btree ("location");--> statement-breakpoint
CREATE INDEX "kitchen_inventory_expires_on_idx" ON "kitchen_inventory" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "kitchen_inventory_name_idx" ON "kitchen_inventory" USING btree (lower("name"));