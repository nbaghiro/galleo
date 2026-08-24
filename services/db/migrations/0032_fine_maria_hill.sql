CREATE TABLE "narrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"section_id" text NOT NULL,
	"hash" text NOT NULL,
	"voice_id" text NOT NULL,
	"model_id" text NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"bytes" bigint NOT NULL,
	"ms" integer NOT NULL,
	"alignment" jsonb,
	"chars" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"library_id" text,
	"source" text NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"description" text,
	"labels" jsonb,
	"preview_url" text,
	"preview_data" text,
	"adopted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "voices_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "voices_library_id_unique" UNIQUE("library_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_voices" (
	"workspace_id" uuid NOT NULL,
	"voice_id" uuid NOT NULL,
	"name" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_voices_workspace_id_voice_id_pk" PRIMARY KEY("workspace_id","voice_id")
);
--> statement-breakpoint
ALTER TABLE "narrations" ADD CONSTRAINT "narrations_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_voices" ADD CONSTRAINT "workspace_voices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_voices" ADD CONSTRAINT "workspace_voices_voice_id_voices_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."voices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "narrations_section_hash_key" ON "narrations" USING btree ("artifact_id","section_id","hash");--> statement-breakpoint
CREATE INDEX "narrations_artifact_idx" ON "narrations" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "voices_source_idx" ON "voices" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_voices_default_key" ON "workspace_voices" USING btree ("workspace_id") WHERE "workspace_voices"."is_default";