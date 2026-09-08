ALTER TABLE "workspaces" ADD COLUMN "artifacts_made" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "workspaces" w SET "artifacts_made" = (SELECT count(*) FROM "artifacts" a WHERE a."workspace_id" = w."id");
