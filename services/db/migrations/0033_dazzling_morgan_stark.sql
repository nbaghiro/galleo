CREATE TABLE "oauth_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_ids" jsonb NOT NULL,
	"default_workspace_id" uuid NOT NULL,
	"scopes" jsonb NOT NULL,
	"resource" text NOT NULL,
	"code_challenge" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_authorizations_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_ids" jsonb NOT NULL,
	"default_workspace_id" uuid NOT NULL,
	"scopes" jsonb NOT NULL,
	"access_hash" text NOT NULL,
	"refresh_hash" text,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_tokens_access_hash_unique" UNIQUE("access_hash"),
	CONSTRAINT "oauth_tokens_refresh_hash_unique" UNIQUE("refresh_hash")
);
--> statement-breakpoint
ALTER TABLE "oauth_authorizations" ADD CONSTRAINT "oauth_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_authorizations_user_idx" ON "oauth_authorizations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_user_idx" ON "oauth_tokens" USING btree ("user_id");