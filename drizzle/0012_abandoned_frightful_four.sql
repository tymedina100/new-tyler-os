CREATE TABLE "consumption_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"logged_on" date NOT NULL,
	"feedback" text,
	"voided_at" timestamp with time zone,
	CONSTRAINT "consumption_kind_check" CHECK ("consumption_entries"."kind" in ('food','drink')),
	CONSTRAINT "consumption_feedback_check" CHECK ("consumption_entries"."feedback" is null or "consumption_entries"."feedback" in ('like','dislike')),
	CONSTRAINT "consumption_description_check" CHECK (length(trim("consumption_entries"."description")) between 1 and 1000)
);
--> statement-breakpoint
CREATE INDEX "consumption_day_idx" ON "consumption_entries" USING btree ("logged_on");--> statement-breakpoint
CREATE INDEX "consumption_recent_idx" ON "consumption_entries" USING btree ("occurred_at");