CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"artifact_id" uuid,
	"config" jsonb NOT NULL,
	"spans" jsonb NOT NULL,
	"checks" jsonb,
	"status" text NOT NULL,
	"error" text,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"credits" integer NOT NULL,
	"ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_runs_ws_created_idx" ON "eval_runs" USING btree ("workspace_id","created_at" DESC NULLS LAST);