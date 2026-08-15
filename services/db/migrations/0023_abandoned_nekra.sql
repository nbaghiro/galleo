ALTER TABLE "workspaces" ADD COLUMN "ai_credits_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Open every workspace on one month's grant rather than at zero. The dropped column counted usage
-- against a limit, so it cannot be converted, and a bare ADD would strand everyone with no credits
-- until their window rolled. Mirrors monthlyGrantFor in model/billing.ts.
UPDATE "workspaces" SET "ai_credits_balance" = CASE "plan"
    WHEN 'premium' THEN 2400 + GREATEST(0, "seats" - 3) * 800
    WHEN 'pro' THEN 700
    ELSE 100
END;
