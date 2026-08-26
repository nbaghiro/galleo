CREATE TABLE "workspace_soundtracks" (
	"workspace_id" uuid NOT NULL,
	"soundtrack_id" uuid NOT NULL,
	"name" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_soundtracks_workspace_id_soundtrack_id_pk" PRIMARY KEY("workspace_id","soundtrack_id")
);
--> statement-breakpoint
ALTER TABLE "soundtracks" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_soundtracks" ADD CONSTRAINT "workspace_soundtracks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_soundtracks" ADD CONSTRAINT "workspace_soundtracks_soundtrack_id_soundtracks_id_fk" FOREIGN KEY ("soundtrack_id") REFERENCES "public"."soundtracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_soundtracks_default_key" ON "workspace_soundtracks" USING btree ("workspace_id") WHERE "workspace_soundtracks"."is_default";--> statement-breakpoint
ALTER TABLE "soundtracks" ADD CONSTRAINT "soundtracks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;