CREATE TABLE "visits" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"uses" integer DEFAULT 1 NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "visits_user_id_kind_ref_pk" PRIMARY KEY("user_id","kind","ref")
);
--> statement-breakpoint
DELETE FROM "themes" WHERE "workspace_id" IS NULL;--> statement-breakpoint
ALTER TABLE "themes" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visits_kind_ref_idx" ON "visits" USING btree ("kind","ref");
