ALTER TYPE "public"."job_kind" ADD VALUE 'today_briefing_ai';--> statement-breakpoint
CREATE TABLE "ai_execution_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"product" text,
	"capacity_pool_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_execution_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_execution_profiles" ADD CONSTRAINT "ai_execution_profiles_capacity_pool_id_capacity_pools_id_fk" FOREIGN KEY ("capacity_pool_id") REFERENCES "public"."capacity_pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_execution_profiles_key_unique_idx" ON "ai_execution_profiles" USING btree ("key");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_ai_execution_profile_id_ai_execution_profiles_id_fk" FOREIGN KEY ("ai_execution_profile_id") REFERENCES "public"."ai_execution_profiles"("id") ON DELETE restrict ON UPDATE no action;