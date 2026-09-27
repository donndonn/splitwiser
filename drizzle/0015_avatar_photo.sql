ALTER TABLE "users" ADD COLUMN "account_image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_blob_pathname" text;--> statement-breakpoint
-- Existing accounts keep their provider photo as the one to switch back to.
UPDATE "users" SET "account_image" = "image" WHERE "image" IS NOT NULL;
