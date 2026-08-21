-- Collapse rows the new keys would reject: same external url, or same bytes, inside one workspace.
-- The oldest survives and every reference to a loser is repointed first, so no artifact is left
-- holding a url that resolves to nothing. Content and digest both carry the id, so both are rewritten.
DO $$
DECLARE d RECORD;
BEGIN
    FOR d IN
        WITH ranked AS (
            SELECT id, FIRST_VALUE(id) OVER (
                       PARTITION BY workspace_id, origin ORDER BY created_at, id
                   ) AS keep
            FROM assets WHERE origin IS NOT NULL
            UNION ALL
            SELECT id, FIRST_VALUE(id) OVER (
                       PARTITION BY workspace_id, sha256 ORDER BY created_at, id
                   ) AS keep
            FROM assets WHERE sha256 IS NOT NULL
        )
        SELECT DISTINCT id AS loser, keep AS survivor FROM ranked WHERE id <> keep
    LOOP
        UPDATE artifacts
        SET draft_content = replace(draft_content::text, d.loser::text, d.survivor::text)::jsonb,
            digest = replace(COALESCE(digest, '{}'::jsonb)::text, d.loser::text, d.survivor::text)::jsonb
        WHERE draft_content::text LIKE '%' || d.loser::text || '%'
           OR COALESCE(digest, '{}'::jsonb)::text LIKE '%' || d.loser::text || '%';
        DELETE FROM assets WHERE id = d.loser;
    END LOOP;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_ws_origin_key" ON "assets" USING btree ("workspace_id","origin") WHERE "assets"."origin" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_ws_sha_key" ON "assets" USING btree ("workspace_id","sha256") WHERE "assets"."sha256" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_bytes_hashed" CHECK (("assets"."data" IS NULL) = ("assets"."sha256" IS NULL));--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_servable" CHECK ("assets"."data" IS NOT NULL OR "assets"."origin" IS NOT NULL);