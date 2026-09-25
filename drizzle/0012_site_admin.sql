CREATE TABLE "admin_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Added without a default so existing accounts keep an unknown (null) signup date.
ALTER TABLE "users" ADD COLUMN "created_at" timestamp;--> statement-breakpoint
-- Unfinished signups start their stale-cleanup window at rollout.
UPDATE "users" SET "created_at" = now() WHERE "onboarding_completed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
CREATE INDEX "admin_actions_created_idx" ON "admin_actions" USING btree ("created_at");