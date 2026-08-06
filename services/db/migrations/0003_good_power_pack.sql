CREATE TABLE "link_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"recipient_id" uuid,
	"viewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "link_views" ADD CONSTRAINT "link_views_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_views" ADD CONSTRAINT "link_views_recipient_id_link_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."link_recipients"("id") ON DELETE set null ON UPDATE no action;