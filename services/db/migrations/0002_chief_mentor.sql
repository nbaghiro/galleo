ALTER TABLE "links" DROP CONSTRAINT "links_published_version_id_versions_id_fk";--> statement-breakpoint
ALTER TABLE "versions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "versions" CASCADE;--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN "published_version_id";--> statement-breakpoint
ALTER TABLE "links" DROP COLUMN "published_version_id";
