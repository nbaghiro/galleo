ALTER TABLE "link_views" ADD COLUMN "session_key" text;--> statement-breakpoint
ALTER TABLE "link_views" ADD COLUMN "referrer" text;--> statement-breakpoint
ALTER TABLE "link_views" ADD COLUMN "device" text;--> statement-breakpoint
ALTER TABLE "link_views" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "link_views" ADD COLUMN "last_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "link_views" ADD COLUMN "max_unit" integer;--> statement-breakpoint
ALTER TABLE "link_views" ADD COLUMN "unit_total" integer;--> statement-breakpoint
ALTER TABLE "link_views" ADD CONSTRAINT "link_views_link_id_session_key_unique" UNIQUE("link_id","session_key");