ALTER TABLE "artifacts" ADD COLUMN "member_access" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "default_artifact_access" text DEFAULT 'edit' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "publish_policy" text DEFAULT 'members' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "member_credit_cap" integer;