ALTER TABLE "workspaces" ADD COLUMN "credits_started_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "scheduled_change" jsonb;--> statement-breakpoint
UPDATE "workspaces" SET "credits_started_at" = "credits_reset_at" - interval '30 days';