ALTER TABLE "credits" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_key_unique" UNIQUE("key");