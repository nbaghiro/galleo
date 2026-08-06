import { Hono } from "hono";
import type { Context } from "hono";
import type { CreditPackId, Interval, PlanId } from "@model/billing";
import { planFor } from "@model/billing";
import type { MeterParams, ToolId, Usage } from "@model/credits";
import { readJson } from "../utils/http";
import {
    billingSummary,
    changePlan,
    checkoutUrl,
    consumeWebhook,
    creditLedger,
    portalUrl,
    resumeSubscription,
    spendCredits,
    stripeReady,
    topupUrl,
} from "../core/billing";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";

// One router for the whole plan surface. /features is its own file; this is /billing/*.
export const plan = new Hono<WorkspaceEnv>();

// Owner-only: members read /billing but can't change what's paid for.
const notOwner = (c: Context, ws: { ownerId: string }, userId: string): Response | null =>
    ws.ownerId !== userId
        ? c.json({ error: "only the workspace owner can manage billing" }, 403)
        : null;

const NOT_CONFIGURED = { error: "billing not configured" } as const;

plan.get("/billing", requireWorkspace, async (c) => c.json(await billingSummary(c.get("ws"))));

plan.post("/billing/checkout", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const denied = notOwner(c, ws, user.id);
    if (denied) return denied;
    if (!stripeReady()) return c.json(NOT_CONFIGURED, 503);
    const want = await readJson<{ plan?: PlanId; interval?: Interval; seats?: number }>(c);
    const result = await checkoutUrl(ws, user.email, want);
    if (result && typeof result === "object" && "error" in result)
        return c.json({ error: "invalid plan" }, 400);
    return c.json({ url: result });
});

plan.post("/billing/topup", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const denied = notOwner(c, ws, user.id);
    if (denied) return denied;
    if (!stripeReady()) return c.json(NOT_CONFIGURED, 503);
    if (!planFor(ws.plan).ai.creditTopUpsAllowed)
        return c.json({ error: "Credit top-ups need a paid plan — upgrade.", upgrade: true }, 402);
    const { pack } = await readJson<{ pack?: CreditPackId }>(c);
    const result = await topupUrl(ws, user.email, pack);
    if ("error" in result)
        return result.error === "invalid-pack"
            ? c.json({ error: "invalid pack" }, 400)
            : c.json({ error: "pack not configured" }, 503);
    return c.json({ url: result.url });
});

plan.post("/billing/portal", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const denied = notOwner(c, ws, user.id);
    if (denied) return denied;
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
    const want = await readJson<{ plan?: PlanId; interval?: Interval; seats?: number }>(c);
    const result = await changePlan(ws, ws.stripeSubscriptionId, want);
    if ("error" in result) {
        if (result.error === "no-item") return c.json({ error: "no subscription item" }, 400);
        if (result.error === "invalid-plan") return c.json({ error: "invalid plan" }, 400);
        return c.json(
            {
                error: `Your workspace has ${result.members} members — remove members before reducing seats.`,
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

plan.get("/billing/ledger", requireWorkspace, async (c) =>
    c.json({ entries: await creditLedger(c.get("ws").id) }),
);

plan.post("/billing/spend", requireWorkspace, async (c) => {
    const body = await readJson<{
        amount?: number;
        action?: ToolId;
        meter?: MeterParams;
        usage?: Usage;
    }>(c);
    const spend = await spendCredits(c.get("ws"), body);
    if (!spend.ok)
        return c.json(
            { error: "out of AI credits", upgrade: true, remaining: spend.remaining },
            402,
        );
    return c.json({ remaining: spend.remaining });
});

// Unauthenticated: verified by signature, and it needs the RAW body bytes.
plan.post("/billing/webhook", async (c) => {
    const result = await consumeWebhook(await c.req.text(), c.req.header("stripe-signature"));
    if ("error" in result) return c.json({ error: result.error }, 400);
    return c.json(result.duplicate ? { received: true, duplicate: true } : { received: true });
});
