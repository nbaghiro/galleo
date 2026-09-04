CREATE TABLE "eval_verdicts" (
	"run_id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"judgements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"user_id" uuid,
	"surface" text NOT NULL,
	"tool" text NOT NULL,
	"generation_id" uuid,
	"artifact_id" uuid,
	"level" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"models" jsonb NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"credits" integer NOT NULL,
	"ms" integer NOT NULL,
	"spans" jsonb NOT NULL,
	"input" jsonb,
	"content" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- the old eval runs become full-level traces (their spans as model calls under a synthesized root
-- tool span, their config as the input) and their layout checks and judgements become verdicts
INSERT INTO "traces" ("id", "workspace_id", "user_id", "surface", "tool", "generation_id", "artifact_id", "level", "status", "error", "models", "tokens_in", "tokens_out", "credits", "ms", "spans", "input", "content", "created_at")
SELECT
	r."id",
	r."workspace_id",
	r."user_id",
	'direct',
	t."tool",
	NULL,
	r."artifact_id",
	'full',
	t."status",
	r."error",
	coalesce(r."config"->'meta'->'models', '{}'::jsonb),
	r."tokens_in",
	r."tokens_out",
	r."credits",
	r."ms",
	jsonb_build_array(jsonb_build_object('kind', 'tool', 'id', r."id"::text, 'parent', NULL, 'at', 0, 'tool', t."tool", 'surface', 'direct', 'ms', r."ms", 'status', t."status"))
		|| coalesce((SELECT jsonb_agg(s || jsonb_build_object('kind', 'model', 'id', gen_random_uuid()::text, 'parent', r."id"::text, 'at', 0)) FROM jsonb_array_elements(r."spans") s), '[]'::jsonb),
	r."config"->'meta',
	r."content",
	r."created_at"
FROM "eval_runs" r
CROSS JOIN LATERAL (
	SELECT
		CASE r."config"->>'kind'
			WHEN 'plan' THEN 'plan-outline'
			WHEN 'build' THEN 'write-beat'
			WHEN 'section' THEN 'add-section'
			WHEN 'chat' THEN 'ask-assistant'
			WHEN 'generate' THEN 'generate-artifact'
			ELSE coalesce(r."config"->>'kind', 'generate-artifact')
		END AS "tool",
		CASE r."status" WHEN 'ok' THEN 'ok' WHEN 'aborted' THEN 'aborted' ELSE 'error' END AS "status"
) t;--> statement-breakpoint
INSERT INTO "eval_verdicts" ("run_id", "workspace_id", "checks", "judgements", "updated_at")
SELECT
	r."id"::text,
	r."workspace_id",
	coalesce((SELECT jsonb_agg(c) FROM jsonb_array_elements(coalesce(r."checks", '[]'::jsonb)) c WHERE c->>'dimension' = 'layout'), '[]'::jsonb),
	coalesce(r."judgements", '[]'::jsonb),
	r."created_at"
FROM "eval_runs" r
WHERE r."judgements" IS NOT NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(r."checks", '[]'::jsonb)) c WHERE c->>'dimension' = 'layout');--> statement-breakpoint
DROP TABLE "eval_runs" CASCADE;--> statement-breakpoint
ALTER TABLE "eval_verdicts" ADD CONSTRAINT "eval_verdicts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traces" ADD CONSTRAINT "traces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traces" ADD CONSTRAINT "traces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "traces_ws_created_idx" ON "traces" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "traces_generation_idx" ON "traces" USING btree ("generation_id");