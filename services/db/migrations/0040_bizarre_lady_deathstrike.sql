ALTER TABLE "oauth_accounts" ADD COLUMN "access_token" text;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "access_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "scopes" text;