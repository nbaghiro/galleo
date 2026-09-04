CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"created_by" uuid,
	"stage" text NOT NULL,
	"brief" jsonb NOT NULL,
	"brief_version" integer DEFAULT 0 NOT NULL,
	"outline" jsonb,
	"planned_against" integer,
	"steer" text DEFAULT '' NOT NULL,
	"clarify" text,
	"beats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generations_ws_artifact_idx" ON "generations" USING btree ("workspace_id","artifact_id");