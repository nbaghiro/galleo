ALTER TABLE "workspaces" ADD COLUMN "plan_interval" text;--> statement-breakpoint
-- existing subscriptions predate the column; month is the only interval sold so far, and the next
-- subscription webhook corrects any annual one
UPDATE "workspaces" SET "plan_interval" = 'month' WHERE "stripe_subscription_id" IS NOT NULL;
