CREATE TABLE "artifact_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"access" text DEFAULT 'edit' NOT NULL,
	"invited_by" uuid,
	"token_hash" text,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_grants_artifact_id_email_unique" UNIQUE("artifact_id","email")
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact_grants" ADD CONSTRAINT "artifact_grants_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_grants" ADD CONSTRAINT "artifact_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_grants" ADD CONSTRAINT "artifact_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_grants" ADD CONSTRAINT "artifact_grants_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_grants_user_idx" ON "artifact_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artifact_grants_email_idx" ON "artifact_grants" USING btree ("email");