import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { creditPurchaseUsd } from "@model/billing";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import type { Transport } from "@services/utils/analytics";
import { initAnalytics, shutdownAnalytics } from "@services/utils/analytics";
import { reserve } from "@services/core/spend";
import { consumeWebhook, stripe } from "@services/core/billing";
import {
    createMachineClient,
    machineGrant,
    revokeMachineClient,
} from "@services/core/authorization";
import { seedUser } from "@services/__tests__/harness";
import { stripeLineItems } from "@services/__tests__/stripe-fixtures";

// The events the unit suite cannot reach: they only exist once a real ledger row is written, a real
// balance is short, or a real webhook lands. The transport is the only thing faked, as everywhere.

const WEBHOOK_SECRET = "whsec_analytics_itest";

interface WireEvent {
    event: string;
    properties: Record<string, unknown>;
}

const captured: WireEvent[] = [];

const recorder: Transport = async (_url, options) => {
    const raw = options.body;
    const body =
        typeof raw === "string"
            ? raw
            : raw
              ? gunzipSync(Buffer.from(await raw.arrayBuffer())).toString("utf8")
              : "";
    if (body.startsWith("{"))
        captured.push(...((JSON.parse(body) as { batch?: WireEvent[] }).batch ?? []));
    return { status: 200, text: async () => "{}", json: async () => ({}) };
};

/** Drains the queue first: nothing is on the wire until the client flushes. */
const eventsNamed = async (name: string): Promise<WireEvent[]> => {
    await shutdownAnalytics();
    return captured.filter((e) => e.event === name);
};

const setBalance = (workspaceId: string, credits: number): Promise<unknown> =>
    db
        .update(schema.workspaces)
        .set({ aiCreditsBalance: credits })
        .where(eq(schema.workspaces.id, workspaceId));

const workspaceRow = async (id: string) =>
    (await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id)))[0]!;

describe("the credit wall, against a real ledger", () => {
    beforeEach(() => {
        captured.length = 0;
        initAnalytics({ key: "phc_itest", fetch: recorder });
    });

    afterEach(async () => {
        await shutdownAnalytics();
    });

    it("reports the wall when the balance cannot cover the action", async () => {
        const { userId, workspaceId } = await seedUser();
        await setBalance(workspaceId, 3); // ask-assistant reserves 10

        const held = await reserve(await workspaceRow(workspaceId), userId, "ask-assistant");
        expect(held.ok).toBe(false);

        const [wall] = await eventsNamed("credits_exhausted");
        expect(wall?.properties.blocked_tool_id).toBe("ask-assistant");
        expect(wall?.properties.plan_id).toBe("free");
        expect(wall?.properties.credits_remaining).toBe(3);
        // Free can upgrade but may not buy packs, so exactly one remedy is on offer
        expect(wall?.properties.upgrade_offered).toBe(true);
        expect(wall?.properties.topup_offered).toBe(false);
    });

    // A member over their own ceiling is a different wall from an empty pool: the pool may be full,
    // and only an admin can raise the cap, so neither remedy applies and offering one would be a lie.
    it("offers nothing when a member hits their own cap rather than the pool", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setBalance(workspaceId, 5_000);
        await db
            .update(schema.workspaces)
            .set({ memberCreditCap: 1 })
            .where(eq(schema.workspaces.id, workspaceId));

        const held = await reserve(await workspaceRow(workspaceId), userId, "ask-assistant", {
            role: "member",
        });
        expect(held.ok).toBe(false);

        const [wall] = await eventsNamed("credits_exhausted");
        expect(wall?.properties.plan_id).toBe("pro");
        expect(wall?.properties.upgrade_offered).toBe(false);
        expect(wall?.properties.topup_offered).toBe(false);
    });

    // The invariant the spec is most insistent about: the number on the event and the number in the
    // ledger are the same number, because one is read off the other rather than recomputed.
    it("charges the settled cost, not the estimate, and agrees with the ledger row", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        await setBalance(workspaceId, 1_000);

        const held = await reserve(await workspaceRow(workspaceId), userId, "ask-assistant");
        if (!held.ok) throw new Error("a funded workspace must not be refused");
        // A run that burns no tokens and produces nothing owes nothing, so the reserve refunds itself
        await held.settle(async () => "done");

        const [done] = await eventsNamed("ai_action_completed");
        expect(done?.properties.tool_id).toBe("ask-assistant");
        const charged = done?.properties.credits_charged as number;

        const rows = await db
            .select()
            .from(schema.credits)
            .where(
                and(
                    eq(schema.credits.workspaceId, workspaceId),
                    eq(schema.credits.reason, "ask-assistant"),
                ),
            );
        const ledger = rows.reduce((n, r) => n - r.delta, 0);
        expect(charged).toBe(ledger);
        // and the estimate was 10, so the settle really did move it
        expect(charged).toBeLessThan(10);

        const after = await workspaceRow(workspaceId);
        expect(after.aiCreditsBalance).toBe(1_000 - ledger);
    });
});

describe("the Stripe webhook, which has no client in the request", () => {
    const CREDIT_PRICE = "price_credit_itest";
    const BOUGHT = 500;

    beforeEach(() => {
        captured.length = 0;
        process.env.STRIPE_SECRET_KEY ??= "sk_test_itest";
        process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
        process.env.STRIPE_PRICE_CREDIT = CREDIT_PRICE;
        // The grant reads the quantity Stripe charged for, so that one lookup is stubbed on the live
        // client. Everything else stays real, signature verification included: this file exists to
        // prove a forged event is rejected, which a package-level mock would quietly remove.
        vi.spyOn(stripe().checkout.sessions, "listLineItems").mockResolvedValue(
            stripeLineItems([{ priceId: CREDIT_PRICE, quantity: BOUGHT }], "cs_topup_1"),
        );
        initAnalytics({ key: "phc_itest", fetch: recorder });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await shutdownAnalytics();
    });

    it("reports a credit purchase and grants the credits it reports", async () => {
        const { workspaceId } = await seedUser();
        const before = (await workspaceRow(workspaceId)).aiCreditsBalance;
        const usd = creditPurchaseUsd(BOUGHT);

        const payload = JSON.stringify({
            id: "evt_topup_1",
            object: "event",
            type: "checkout.session.completed",
            data: {
                object: {
                    id: "cs_topup_1",
                    object: "checkout.session",
                    mode: "payment",
                    // the money has to have landed before the credits do
                    payment_status: "paid",
                    amount_total: Math.round(usd * 100),
                    client_reference_id: workspaceId,
                    metadata: { workspaceId },
                },
            },
        });
        const signature = Stripe.webhooks.generateTestHeaderString({
            payload,
            secret: WEBHOOK_SECRET,
        });

        expect(await consumeWebhook(payload, signature)).toEqual({ received: true });

        const [topup] = await eventsNamed("topup_purchased");
        expect(topup?.properties.credits).toBe(BOUGHT);
        expect(topup?.properties.usd).toBe(usd);
        // the event is not a claim about the row; the row moved too
        expect((await workspaceRow(workspaceId)).aiCreditsBalance).toBe(before + BOUGHT);
    });

    it("says nothing at all when the signature does not check out", async () => {
        const { workspaceId } = await seedUser();
        const before = (await workspaceRow(workspaceId)).aiCreditsBalance;
        const payload = JSON.stringify({
            id: "evt_topup_2",
            type: "checkout.session.completed",
            data: {
                object: { id: "cs_2", mode: "payment", payment_status: "paid" },
            },
        });

        expect(await consumeWebhook(payload, "t=1,v1=forged")).toEqual({ error: "bad signature" });
        expect(await eventsNamed("topup_purchased")).toHaveLength(0);
        expect((await workspaceRow(workspaceId)).aiCreditsBalance).toBe(before);
    });
});

describe("workspace API credentials, which only the row can date", () => {
    beforeEach(() => {
        captured.length = 0;
        initAnalytics({ key: "phc_itest", fetch: recorder });
    });

    afterEach(async () => {
        await shutdownAnalytics();
    });

    it("reports an issued credential, counting what the workspace holds after it", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        await createMachineClient({ name: "CI", workspaceId, actorId: userId });
        const made = await createMachineClient({ name: "Zap", workspaceId, actorId: userId });

        const events = await eventsNamed("api_credential_created");
        expect(events).toHaveLength(2);
        expect(events[1]?.properties.client_id).toBe(made.clientId);
        expect(events[1]?.properties.credential_count_after).toBe(2);
        // the name is the customer's own words, so it never travels
        expect(JSON.stringify(events[1]?.properties)).not.toContain("Zap");
        expect(JSON.stringify(events[1]?.properties)).not.toContain(made.secret);
    });

    it("reports a revoked credential once, with whether anything ever used it", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        const made = await createMachineClient({ name: "CI", workspaceId, actorId: userId });

        expect(await revokeMachineClient(workspaceId, made.clientId, userId)).toBe(true);
        // nothing is left to turn off, so the second call is not a second death
        expect(await revokeMachineClient(workspaceId, made.clientId, userId)).toBe(false);

        const events = await eventsNamed("api_credential_revoked");
        expect(events).toHaveLength(1);
        expect(events[0]?.properties.client_id).toBe(made.clientId);
        expect(events[0]?.properties.days_active).toBe(0);
        expect(events[0]?.properties.ever_used).toBe(false);
    });

    it("says a credential was used once a token has been minted from it", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "premium" });
        const made = await createMachineClient({ name: "CI", workspaceId, actorId: userId });
        expect(await machineGrant(made.clientId, made.secret, ["artifacts:read"])).toMatchObject({
            scopes: ["artifacts:read"],
        });

        await revokeMachineClient(workspaceId, made.clientId, userId);
        const [revoked] = await eventsNamed("api_credential_revoked");
        expect(revoked?.properties.ever_used).toBe(true);
    });
});
