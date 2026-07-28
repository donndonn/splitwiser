CREATE TYPE "public"."group_activity_type" AS ENUM('expense_created', 'expense_updated', 'expense_deleted', 'group_renamed', 'settlement_recorded', 'member_joined', 'member_left');--> statement-breakpoint
CREATE TABLE "group_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"type" "group_activity_type" NOT NULL,
	"actor_member_id" text,
	"expense_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_activities" ADD CONSTRAINT "group_activities_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_activities" ADD CONSTRAINT "group_activities_actor_member_id_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_activities_group_created_idx" ON "group_activities" USING btree ("group_id","created_at");
