CREATE TYPE "public"."capacity_confidence" AS ENUM('exact', 'estimated', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."capacity_reset_type" AS ENUM('none', 'daily', 'weekly', 'monthly', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."capacity_unit" AS ENUM('usd', 'percent', 'requests', 'tokens', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."runtime_capability" AS ENUM('deterministic', 'browser', 'code', 'research', 'external_api');--> statement-breakpoint
CREATE TABLE "capacity_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"product" text NOT NULL,
	"pool_key" text NOT NULL,
	"display_name" text NOT NULL,
	"remaining" numeric(14, 6),
	"remaining_unit" "capacity_unit" DEFAULT 'unknown' NOT NULL,
	"estimate_confidence" "capacity_confidence" DEFAULT 'unknown' NOT NULL,
	"reset_type" "capacity_reset_type" DEFAULT 'unknown' NOT NULL,
	"reset_at" timestamp with time zone,
	"reset_timezone" text,
	"last_verified_at" timestamp with time zone,
	"hard_dollar_limit" numeric(12, 2),
	"source_note" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capacity_pools_remaining_nonnegative" CHECK ("capacity_pools"."remaining" is null or "capacity_pools"."remaining" >= 0),
	CONSTRAINT "capacity_pools_percent_range" CHECK ("capacity_pools"."remaining_unit" <> 'percent' or "capacity_pools"."remaining" is null or ("capacity_pools"."remaining" >= 0 and "capacity_pools"."remaining" <= 100))
);
--> statement-breakpoint
CREATE TABLE "capacity_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"previous_remaining" numeric(14, 6),
	"new_remaining" numeric(14, 6),
	"note" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_capabilities" (
	"runtime_id" uuid NOT NULL,
	"capability" "runtime_capability" NOT NULL,
	CONSTRAINT "runtime_capabilities_runtime_id_capability_pk" PRIMARY KEY("runtime_id","capability")
);
--> statement-breakpoint
CREATE TABLE "runtime_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runtime_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "runtime_role_grants" (
	"runtime_id" uuid NOT NULL,
	"role" "org_role" NOT NULL,
	CONSTRAINT "runtime_role_grants_runtime_id_role_pk" PRIMARY KEY("runtime_id","role")
);
--> statement-breakpoint
CREATE TABLE "usage_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"runtime_id" uuid NOT NULL,
	"provider" text,
	"product" text,
	"pool_key" text,
	"model" text,
	"input_tokens" integer,
	"cached_input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_usd" numeric(12, 6),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "runtimes_kind_unique_idx";--> statement-breakpoint
ALTER TABLE "runtimes" ADD COLUMN "instance_key" text;--> statement-breakpoint
ALTER TABLE "runtimes" ADD COLUMN "device_id" text;--> statement-breakpoint
UPDATE "runtimes" SET "instance_key" = "kind"::text WHERE "instance_key" IS NULL;--> statement-breakpoint
ALTER TABLE "runtimes" ALTER COLUMN "instance_key" SET NOT NULL;--> statement-breakpoint
INSERT INTO "runtime_role_grants" ("runtime_id", "role")
SELECT "id", 'miles'::"org_role" FROM "runtimes"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "runtime_capabilities" ("runtime_id", "capability")
SELECT "id", 'deterministic'::"runtime_capability" FROM "runtimes" WHERE "kind" = 'python'
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "capacity_updates" ADD CONSTRAINT "capacity_updates_pool_id_capacity_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."capacity_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_capabilities" ADD CONSTRAINT "runtime_capabilities_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_credentials" ADD CONSTRAINT "runtime_credentials_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_role_grants" ADD CONSTRAINT "runtime_role_grants_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_entries" ADD CONSTRAINT "usage_entries_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_entries" ADD CONSTRAINT "usage_entries_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "capacity_pools_key_unique_idx" ON "capacity_pools" USING btree ("pool_key");--> statement-breakpoint
CREATE INDEX "capacity_updates_pool_idx" ON "capacity_updates" USING btree ("pool_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_credentials_hash_unique_idx" ON "runtime_credentials" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "runtime_credentials_runtime_idx" ON "runtime_credentials" USING btree ("runtime_id");--> statement-breakpoint
CREATE INDEX "usage_entries_run_idx" ON "usage_entries" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "usage_entries_runtime_idx" ON "usage_entries" USING btree ("runtime_id");--> statement-breakpoint
CREATE INDEX "usage_entries_recorded_idx" ON "usage_entries" USING btree ("recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "runtimes_instance_key_unique_idx" ON "runtimes" USING btree ("instance_key");--> statement-breakpoint
CREATE INDEX "runtimes_kind_idx" ON "runtimes" USING btree ("kind");