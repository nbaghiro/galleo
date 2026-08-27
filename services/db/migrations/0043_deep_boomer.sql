-- format_id and theme_id become generated columns over draft_content, which is the only place
-- either is stored. The drop and re-add is also the backfill: every row recomputes from its own
-- content, so rows that had drifted (a deck switched to a site over the collaboration socket,
-- which never wrote the columns) come back correct. The fallbacks are what a create with no
-- content used to default to.
ALTER TABLE "artifacts" drop column "format_id";--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "format_id" text GENERATED ALWAYS AS (coalesce(draft_content->>'format', 'deck')) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" drop column "theme_id";--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "theme_id" text GENERATED ALWAYS AS (coalesce(draft_content->>'theme', 'studio')) STORED NOT NULL;