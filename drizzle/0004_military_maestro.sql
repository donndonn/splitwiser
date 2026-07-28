CREATE TABLE "friend_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"expires_at" timestamp,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friend_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id_a" text NOT NULL,
	"user_id_b" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_invites" ADD CONSTRAINT "friend_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_a_users_id_fk" FOREIGN KEY ("user_id_a") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_b_users_id_fk" FOREIGN KEY ("user_id_b") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_invites_created_by_user_id_idx" ON "friend_invites" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_pair_unique" ON "friendships" USING btree ("user_id_a","user_id_b");--> statement-breakpoint
CREATE INDEX "friendships_user_a_idx" ON "friendships" USING btree ("user_id_a");--> statement-breakpoint
CREATE INDEX "friendships_user_b_idx" ON "friendships" USING btree ("user_id_b");