import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { BAD_BODY, readJson } from "@services/utils/http";
import { canTopUp, MAX_CREDIT_PURCHASE, MIN_CREDIT_PURCHASE } from "@model/billing";
import {
    billingSummary,
    changePlan,
    checkoutUrl,
    consumeWebhook,
    creditLedger,
    portalUrl,
    resumeSubscription,
    stripeReady,
    topupUrl,
} from "@services/core/billing";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";

// One router for the whole plan surface. /features is its own file; this is /billing/*.
export const plan = new Hono<WorkspaceEnv>();

// Owner-only: members read /billing but can't change what's paid for.
const notOwner = (c: Context, ws: { ownerId: string }, userId: string): Response | null =>
    ws.ownerId !== userId
        ? c.json({ error: "only the workspace owner can manage billing" }, 403)
        : null;

const NOT_CONFIGURED = { error: "billing not configured" } as const;
const SEATS_NOT_CONFIGURED = "Extra seats are not available on this billing interval yet.";

const zWanted = z.object({
    plan: z.enum(["free", "pro", "premium"]).optional(),
    interval: z.enum(["month", "year"]).optional(),
    seats: z.number().int().positive().max(100).optional(),
});

// the bounds live in the schema, so an absurd quantity is a 400 before it reaches Stripe
const zTopup = z.object({
    credits: z.number().int().min(MIN_CREDIT_PURCHASE).max(MAX_CREDIT_PURCHASE),
});

plan.get("/billing", requireWorkspace, async (c) =>
    c.json(await billingSummary(c.get("ws"), c.get("user").id, c.get("role"))),
);

plan.post("/billing/checkout", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const denied = notOwner(c, ws, user.id);
    if (denied) return denied;
    if (!stripeReady()) return c.json(NOT_CONFIGURED, 503);
    // a live subscription changes through change-plan; a second checkout would double-bill
    if (ws.stripeSubscriptionId)
        return c.json({ error: "already subscribed", useChangePlan: true }, 409);
    const want = await readJson(c, zWanted);
    if (!want) return c.json(BAD_BODY, 400);
    const result = await checkoutUrl(ws, user.email, want);
    if (result && typeof result === "object" && "error" in result)
        return result.error === "seats-not-configured"
            ? c.json({ error: SEATS_NOT_CONFIGURED }, 400)
            : c.json({ error: "invalid plan" }, 400);
    return c.json({ url: result });
});

plan.post("/billing/topup", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const denied = notOwner(c, ws, user.id);
    if (denied) return denied;
    if (!stripeReady()) return c.json(NOT_CONFIGURED, 503);
    if (!canTopUp(ws.plan))
        return c.json(
            {
                error: "Buying credits needs a paid plan. Upgrade to buy them.",
                reason: "feature" as const,
                upgrade: true,
            },
            402,
        );
    const body = await readJson(c, zTopup);
    if (!body) return c.json(BAD_BODY, 400);
    const result = await topupUrl(ws, user.email, body.credits);
    if ("error" in result)
        return result.error === "invalid-quantity"
            ? c.json({ error: "invalid credit quantity" }, 400)
            : c.json({ error: "credit purchase is not configured" }, 503);
    return c.json({ url: result.url });
});

plan.post("/billing/portal", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const denied = notOwner(c, ws, user.id);
    if (denied) return denied;
    if (!stripeReady()) return c.json(NOT_CONFIGURED, 503);
    if (!ws.stripeCustomerId) return c.json({ error: "no subscription" }, 400);
    return c.json({ url: await portalUrl(ws.stripeCustomerId) });
});

plan.post("/billing/change-plan", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const denied = notOwner(c, ws, user.id);
    if (denied) return denied;
    if (!ws.stripeSubscriptionId)
        return c.json({ error: "no active subscription", useCheckout: true }, 400);
    if (!stripeReady()) return c.json(NOT_CONFIGURED, 503);
    const want = await readJson(c, zWanted);
    if (!want) return c.json(BAD_BODY, 400);
    const result = await changePlan(ws, ws.stripeSubscriptionId, want);
    if ("error" in result) {
        if (result.error === "no-item") return c.json({ error: "no subscription item" }, 400);
        if (result.error === "invalid-plan") return c.json({ error: "invalid plan" }, 400);
        if (result.error === "seats-not-configured")
            return c.json({ error: SEATS_NOT_CONFIGURED }, 400);
        return c.json(
            {
                error: `Your workspace has ${result.members} members. Remove some before reducing seats.`,
            },
            400,
        );
    }
    return c.json({ ok: true, effect: result.effect });
});

plan.post("/billing/resume", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const denied = notOwner(c, ws, user.id);
    if (denied) return denied;
    if (!ws.stripeSubscriptionId) return c.json({ error: "no active subscription" }, 400);
    if (!stripeReady()) return c.json(NOT_CONFIGURED, 503);
    await resumeSubscription(ws, ws.stripeSubscriptionId);
    return c.json({ ok: true });
});

// parseable garbage must degrade too: an invalid date or a non-uuid id would 500 in the query
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

plan.get("/billing/ledger", requireWorkspace, async (c) => {
    const raw = c.req.query("cursor");
    let cursor: { at: Date; id: string } | null = null;
    if (raw)
        try {
            const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
                at?: string;
                id?: string;
            };
            if (parsed.at && parsed.id && UUID.test(parsed.id)) {
                const at = new Date(parsed.at);
                if (Number.isFinite(at.getTime())) cursor = { at, id: parsed.id };
            }
        } catch {
            /* a bad cursor reads as the first page */
        }
    return c.json(await creditLedger(c.get("ws").id, cursor));
});

// Unauthenticated: verified by signature, and it needs the RAW body bytes.
plan.post("/billing/webhook", async (c) => {
    const result = await consumeWebhook(await c.req.text(), c.req.header("stripe-signature"));
    if ("error" in result) return c.json({ error: result.error }, 400);
    return c.json(result);
});
