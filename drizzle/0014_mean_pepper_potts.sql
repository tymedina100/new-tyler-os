CREATE TABLE "subscription_requests" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"effort" text NOT NULL,
	"prompt" text NOT NULL,
	"today" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;