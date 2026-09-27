ALTER TYPE "public"."group_activity_type" ADD VALUE 'expense_restored' BEFORE 'group_renamed';--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "deleted_by_member_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_deleted_by_member_id_members_id_fk" FOREIGN KEY ("deleted_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;