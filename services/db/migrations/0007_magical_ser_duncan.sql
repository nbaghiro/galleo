ALTER TABLE "artifacts" ADD COLUMN "digest" jsonb;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "search_text" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(search_text, '')), 'B')) STORED;--> statement-breakpoint
CREATE INDEX "artifacts_search_tsv_idx" ON "artifacts" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "artifacts_ws_updated_idx" ON "artifacts" USING btree ("workspace_id","updated_at" DESC NULLS LAST);
