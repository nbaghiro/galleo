-- Clear the credit ledger: history accumulated before the audition-voice metering fix reads as
-- noise (0-delta rows) in the activity views. Balances live on workspaces.ai_credits_balance and
-- are untouched. Gotcha: credits.key doubles as the webhook grant idempotency claim, so a Stripe
-- event redelivered from before this point would re-grant once; acceptable pre-launch.
DELETE FROM "credits";
