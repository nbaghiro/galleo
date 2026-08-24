CREATE TABLE "soundtracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"preset" text,
	"artifact_id" uuid,
	"prompt" text NOT NULL,
	"hash" text NOT NULL,
	"model_id" text NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"bytes" bigint NOT NULL,
	"ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "soundtracks" ADD CONSTRAINT "soundtracks_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "soundtracks_preset_key" ON "soundtracks" USING btree ("preset");--> statement-breakpoint
CREATE UNIQUE INDEX "soundtracks_artifact_key" ON "soundtracks" USING btree ("artifact_id","hash");--> statement-breakpoint
CREATE INDEX "soundtracks_artifact_idx" ON "soundtracks" USING btree ("artifact_id");