CREATE TYPE "public"."recurrence_frequency" AS ENUM('weekly', 'biweekly', 'monthly', 'yearly');--> statement-breakpoint
ALTER TYPE "public"."group_activity_type" ADD VALUE 'recurring_expense_created';--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"source_expense_id" text NOT NULL,
	"frequency" "recurrence_frequency" NOT NULL,
	"starts_at" timestamp NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"next_occurrence_at" timestamp NOT NULL,
	"created_by_member_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_expenses_source_expense_id_unique" UNIQUE("source_expense_id"),
	CONSTRAINT "recurring_expenses_occurrence_count_positive" CHECK ("recurring_expenses"."occurrence_count" >= 1)
);
--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_source_expense_id_expenses_id_fk" FOREIGN KEY ("source_expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_expenses_group_id_idx" ON "recurring_expenses" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "recurring_expenses_next_occurrence_idx" ON "recurring_expenses" USING btree ("next_occurrence_at");