CREATE TABLE "mobile_login_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_mutation_receipts" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"payload_hash" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"config_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
