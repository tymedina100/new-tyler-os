CREATE TYPE "public"."approval_kind" AS ENUM('create_note');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'accepted', 'dismissed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."authorization_level" AS ENUM('observe', 'propose', 'modify_local', 'external_action');--> statement-breakpoint
CREATE TYPE "public"."job_kind" AS ENUM('today_briefing');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'needs_approval', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('miles', 'forge', 'archer', 'mercury', 'atlas', 'scout', 'ledger', 'rally', 'palate');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('manual', 'schedule', 'api');--> statement-breakpoint
CREATE TYPE "public"."runtime_kind" AS ENUM('python', 'grok_bot', 'cursor', 'chatgpt', 'claude', 'gemini', 'api');--> statement-breakpoint
CREATE TYPE "public"."runtime_status" AS ENUM('enabled', 'disabled');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"kind" "approval_kind" NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"accepted_note_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "approvals_create_note_check" CHECK ("approvals"."kind" = 'create_note' and char_length("approvals"."title") > 0 and char_length("approvals"."body") > 0)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "job_kind" NOT NULL,
	"title" text NOT NULL,
	"instruction" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"authorization" "authorization_level" DEFAULT 'observe' NOT NULL,
	"assigned_role" "org_role" NOT NULL,
	"requested_runtime_kind" "runtime_kind",
	"claimed_by_runtime_id" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"runtime_id" uuid NOT NULL,
	"role" "org_role" NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"trigger" "run_trigger" DEFAULT 'manual' NOT NULL,
	"result_summary" text,
	"last_heartbeat_at" timestamp with time zone,
	"provider" text,
	"model" text,
	"input_tokens" integer,
	"cached_input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_usd" numeric(12, 6),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "runtimes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "runtime_kind" NOT NULL,
	"status" "runtime_status" DEFAULT 'enabled' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_accepted_note_id_notes_id_fk" FOREIGN KEY ("accepted_note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_claimed_by_runtime_id_runtimes_id_fk" FOREIGN KEY ("claimed_by_runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_run_idx" ON "approvals" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "approvals_job_idx" ON "approvals" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "approvals_pending_idx" ON "approvals" USING btree ("job_id") WHERE "approvals"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "jobs_status_role_created_idx" ON "jobs" USING btree ("status","assigned_role","created_at");--> statement-breakpoint
CREATE INDEX "jobs_claimed_by_idx" ON "jobs" USING btree ("claimed_by_runtime_id");--> statement-breakpoint
CREATE INDEX "runs_job_idx" ON "runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "runs_runtime_idx" ON "runs" USING btree ("runtime_id");--> statement-breakpoint
CREATE INDEX "runs_started_at_idx" ON "runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "runtimes_kind_unique_idx" ON "runtimes" USING btree ("kind");