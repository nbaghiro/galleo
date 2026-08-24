ALTER TABLE "oauth_tokens" ADD COLUMN "family_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD COLUMN "resource" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "oauth_tokens_family_idx" ON "oauth_tokens" USING btree ("family_id");