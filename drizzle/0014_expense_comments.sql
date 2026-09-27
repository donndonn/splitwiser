CREATE TABLE "expense_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_id" text NOT NULL,
	"author_member_id" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expense_comments_body_length" CHECK (char_length("expense_comments"."body") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "expense_comments" ADD CONSTRAINT "expense_comments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_comments" ADD CONSTRAINT "expense_comments_author_member_id_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_comments_expense_created_idx" ON "expense_comments" USING btree ("expense_id","created_at");