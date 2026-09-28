ALTER TABLE "groups" ADD COLUMN "share_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "groups_share_token_unique" ON "groups" USING btree ("share_token");