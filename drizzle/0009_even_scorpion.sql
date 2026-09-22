CREATE TABLE "group_settle_markers" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"settled_at" timestamp NOT NULL,
	"created_by_member_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_settle_prompt_dismissals" (
	"group_id" text NOT NULL,
	"member_id" text NOT NULL,
	"activity_watermark" timestamp NOT NULL,
	"dismissed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "group_settle_prompt_dismissals_group_id_member_id_pk" PRIMARY KEY("group_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "group_settle_markers" ADD CONSTRAINT "group_settle_markers_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_settle_markers" ADD CONSTRAINT "group_settle_markers_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_settle_prompt_dismissals" ADD CONSTRAINT "group_settle_prompt_dismissals_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_settle_prompt_dismissals" ADD CONSTRAINT "group_settle_prompt_dismissals_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_settle_markers_group_id_idx" ON "group_settle_markers" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_settle_markers_group_settled_at_idx" ON "group_settle_markers" USING btree ("group_id","settled_at");--> statement-breakpoint
CREATE INDEX "group_settle_prompt_dismissals_member_id_idx" ON "group_settle_prompt_dismissals" USING btree ("member_id");