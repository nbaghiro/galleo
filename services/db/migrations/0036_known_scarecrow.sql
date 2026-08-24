ALTER TABLE "oauth_clients" ADD COLUMN "secret_hash" text;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "revoked_at" timestamp;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "last_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;