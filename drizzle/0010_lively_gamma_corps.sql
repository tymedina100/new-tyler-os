ALTER TYPE "public"."approval_status" ADD VALUE 'auto_executed';--> statement-breakpoint
CREATE TABLE "standing_authorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"role" "org_role" NOT NULL,
	"job_kind" "job_kind" NOT NULL,
	"action" "approval_kind" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "standing_authority_id" uuid;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "standing_authority_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "standing_authorities_key_unique_idx" ON "standing_authorities" USING btree ("key");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_standing_authority_id_standing_authorities_id_fk" FOREIGN KEY ("standing_authority_id") REFERENCES "public"."standing_authorities"("id") ON DELETE set null ON UPDATE no action;