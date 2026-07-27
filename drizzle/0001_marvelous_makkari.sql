CREATE TYPE "public"."expense_entry_mode" AS ENUM('simple', 'itemized');--> statement-breakpoint
CREATE TABLE "expense_item_assignments" (
	"expense_item_id" text NOT NULL,
	"member_id" text NOT NULL,
	CONSTRAINT "expense_item_assignments_expense_item_id_member_id_pk" PRIMARY KEY("expense_item_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "expense_items" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_id" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "entry_mode" "expense_entry_mode" DEFAULT 'simple' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tax_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tip_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "fee_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "discount_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_item_assignments" ADD CONSTRAINT "expense_item_assignments_expense_item_id_expense_items_id_fk" FOREIGN KEY ("expense_item_id") REFERENCES "public"."expense_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_item_assignments" ADD CONSTRAINT "expense_item_assignments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_item_assignments_member_id_idx" ON "expense_item_assignments" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "expense_items_expense_id_idx" ON "expense_items" USING btree ("expense_id");