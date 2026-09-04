CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"job_kind" "job_kind" NOT NULL,
	"assigned_role" "org_role" NOT NULL,
	"authorization" "authorization_level" DEFAULT 'observe' NOT NULL,
	"requested_runtime_kind" "runtime_kind",
	"enabled" boolean DEFAULT true NOT NULL,
	"local_time" time(0) NOT NULL,
	"timezone" text NOT NULL,
	"weekdays_only" boolean DEFAULT true NOT NULL,
	"catch_up_until_local_time" time(0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "scheduled_for_date" date;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_key_unique_idx" ON "schedules" USING btree ("key");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_schedule_date_unique_idx" ON "jobs" USING btree ("schedule_id","scheduled_for_date");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_schedule_pair_check" CHECK (("jobs"."schedule_id" is null) = ("jobs"."scheduled_for_date" is null));--> statement-breakpoint
INSERT INTO "schedules" (
  "key",
  "job_kind",
  "assigned_role",
  "authorization",
  "requested_runtime_kind",
  "enabled",
  "local_time",
  "timezone",
  "weekdays_only",
  "catch_up_until_local_time"
) VALUES (
  'miles_weekday_morning_briefing',
  'today_briefing',
  'miles',
  'observe',
  NULL,
  true,
  '06:20:00',
  'America/Phoenix',
  true,
  '12:00:00'
);