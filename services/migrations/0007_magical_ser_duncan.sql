CREATE TABLE "artifact_visits" (
	"user_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"views" integer DEFAULT 1 NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_visits_user_id_artifact_id_pk" PRIMARY KEY("user_id","artifact_id")
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "digest" jsonb;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "search_text" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(search_text, '')), 'B')) STORED;--> statement-breakpoint
ALTER TABLE "artifact_visits" ADD CONSTRAINT "artifact_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_visits" ADD CONSTRAINT "artifact_visits_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_visits_user_viewed_idx" ON "artifact_visits" USING btree ("user_id","viewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "artifacts_search_tsv_idx" ON "artifacts" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "artifacts_ws_updated_idx" ON "artifacts" USING btree ("workspace_id","updated_at" DESC NULLS LAST);