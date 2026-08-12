CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"artifact_id" uuid,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"ref" text,
	"body" text NOT NULL,
	"chars" integer NOT NULL,
	"added_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_items" ADD CONSTRAINT "context_items_context_id_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."contexts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_items" ADD CONSTRAINT "context_items_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contexts" ADD CONSTRAINT "contexts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contexts" ADD CONSTRAINT "contexts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_ws_art_idx" ON "chat_messages" USING btree ("workspace_id","artifact_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chunks_embedding_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunks_ws_scope_idx" ON "chunks" USING btree ("workspace_id","scope");--> statement-breakpoint
CREATE INDEX "chunks_ref_idx" ON "chunks" USING btree ("ref_id");--> statement-breakpoint
CREATE INDEX "context_items_ctx_idx" ON "context_items" USING btree ("context_id");--> statement-breakpoint
CREATE INDEX "contexts_ws_idx" ON "contexts" USING btree ("workspace_id","updated_at" DESC NULLS LAST);