import { Hono } from "hono";
import type { Context } from "hono";
import { readJson } from "@services/utils/http";
import type { CreditPackId } from "@model/billing";
import { canTopUp } from "@model/billing";
import type { Wanted } from "@services/core/billing";
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

plan.get("/billing", requireWorkspace, async (c) =>
    c.json(await billingSummary(c.get("ws"), c.get("user").id)),
);

plan.post("/billing/checkout", requireWorkspace, async (c) => {
    const [user, ws] = [c.get("user"), c.get("ws")];
    const denied = notOwner(c, ws, user.id);
    if (denied) return denied;
    if (!stripeReady()) return c.json(NOT_CONFIGURED, 503);
    // a live subscription changes through change-plan; a second checkout would double-bill
    if (ws.stripeSubscriptionId)
        return c.json({ error: "already subscribed", useChangePlan: true }, 409);
    const want = await readJson<Wanted>(c);
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
    if (!canTopUp(ws.plan))
        return c.json({ error: "Credit packs need a paid plan — upgrade.", upgrade: true }, 402);
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
    const want = await readJson<Wanted>(c);
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

plan.get("/billing/ledger", requireWorkspace, async (c) => {
    const raw = c.req.query("cursor");
    let cursor: { at: Date; id: string } | null = null;
    if (raw)
        try {
            const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
                at?: string;
                id?: string;
            };
            if (parsed.at && parsed.id) cursor = { at: new Date(parsed.at), id: parsed.id };
        } catch {
            /* a bad cursor reads as the first page */
        }
    return c.json(await creditLedger(c.get("ws").id, cursor));
});

// Unauthenticated: verified by signature, and it needs the RAW body bytes.
plan.post("/billing/webhook", async (c) => {
    const result = await consumeWebhook(await c.req.text(), c.req.header("stripe-signature"));
    if ("error" in result) return c.json({ error: result.error }, 400);
    return c.json(result.duplicate ? { received: true, duplicate: true } : { received: true });
});
