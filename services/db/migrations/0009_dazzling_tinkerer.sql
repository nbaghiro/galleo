ALTER TABLE "credits" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credits_ws_created_idx" ON "credits" USING btree ("workspace_id","created_at" DESC NULLS LAST);