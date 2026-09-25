CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"max_users" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id" = 1),
	CONSTRAINT "app_settings_max_users_nonnegative" CHECK ("app_settings"."max_users" >= 0)
);
--> statement-breakpoint
INSERT INTO "app_settings" ("id", "max_users") VALUES (1, 500) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_invite_id" text;--> statement-breakpoint
-- Grandfather every account present at rollout, including accounts without groups.
UPDATE "users" SET "onboarding_completed_at" = now() WHERE "onboarding_completed_at" IS NULL;--> statement-breakpoint
-- Invalidate all previous invitation links before enforcing one current link per group.
UPDATE "invites" SET "revoked_at" = now() WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invites_group_current_unique" ON "invites" USING btree ("group_id") WHERE "invites"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "users_pending_signup_invite_idx" ON "users" USING btree ("signup_invite_id") WHERE "users"."onboarding_completed_at" is null;
