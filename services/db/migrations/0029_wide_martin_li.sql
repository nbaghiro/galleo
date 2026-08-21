CREATE TABLE "artifact_assets" (
	"artifact_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "artifact_assets_artifact_id_asset_id_pk" PRIMARY KEY("artifact_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "used_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact_assets" ADD CONSTRAINT "artifact_assets_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_assets" ADD CONSTRAINT "artifact_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_assets_asset_idx" ON "artifact_assets" USING btree ("asset_id");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_ws_used_idx" ON "assets" USING btree ("workspace_id","used_at" DESC NULLS LAST);--> statement-breakpoint
-- Backfill: an adopted row keeps the url it was sourced from, a stored one has its bytes here and
-- so has no origin at all. `used_at` starts from creation; the hash comes straight out of the bytes.
UPDATE "assets" SET "origin" = "url" WHERE "data" IS NULL AND "url" NOT LIKE '/api/media/asset/%';--> statement-breakpoint
UPDATE "assets" SET "used_at" = "created_at";--> statement-breakpoint
UPDATE "assets" SET "sha256" = encode(sha256(decode("data", 'base64')), 'hex') WHERE "data" IS NOT NULL;--> statement-breakpoint
-- A row with neither bytes nor an origin cannot be served by anything, so it cannot satisfy the
-- constraint added later. Counted out loud first: in a healthy database this is zero, and a non-zero
-- number in the deploy log is worth knowing about, since any content still pointing at one 404s.
DO $$
DECLARE orphaned integer;
BEGIN
    SELECT count(*) INTO orphaned FROM "assets" WHERE "data" IS NULL AND "origin" IS NULL;
    IF orphaned > 0 THEN
        RAISE NOTICE 'assets: dropping % unservable row(s) (no bytes, no origin)', orphaned;
    END IF;
    DELETE FROM "assets" WHERE "data" IS NULL AND "origin" IS NULL;
END $$;
