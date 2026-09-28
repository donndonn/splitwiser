ALTER TABLE "expense_item_assignments" ADD COLUMN "weight" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "expense_items" ADD COLUMN "split_mode" "split_mode" DEFAULT 'equal' NOT NULL;