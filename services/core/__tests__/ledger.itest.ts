import { describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { grantFor, rolloverCapFor } from "@model/billing";
import { seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { chargeCredits, rollIfLapsed, settleCredits } from "@services/core/ledger";

const wsRow = async (id: string) => {
    const [row] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
    return row!;
};

const setBalance = (id: string, balance: number) =>
    db
        .update(schema.workspaces)
        .set({ aiCreditsBalance: balance })
        .where(eq(schema.workspaces.id, id));

const ledgerOf = (id: string) =>
    db
        .select()
        .from(schema.credits)
        .where(eq(schema.credits.workspaceId, id))
        .orderBy(desc(schema.credits.createdAt));

describe("chargeCredits", () => {
    it("refuses a charge the balance cannot cover, and writes no row", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setBalance(workspaceId, 5);

        const spend = await chargeCredits(await wsRow(workspaceId), 30, "test");
        expect(spend.ok).toBe(false);
        expect(spend.remaining).toBe(5);
        expect(spend.entryId).toBeNull();
        expect(await ledgerOf(workspaceId)).toHaveLength(0);
    });

    it("spends straight off the balance", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setBalance(workspaceId, 100);
        const spend = await chargeCredits(await wsRow(workspaceId), 40, "test");
        expect(spend.ok).toBe(true);
        expect(spend.remaining).toBe(60);
        expect((await wsRow(workspaceId)).aiCreditsBalance).toBe(60);
    });

    // banked credits are spendable regardless of where they came from
    it("does not care whether the balance came from a grant or a purchase", async () => {
        const { workspaceId } = await seedUser({ plan: "free" });
        const overGrant = grantFor(await wsRow(workspaceId)) * 4;
        await setBalance(workspaceId, overGrant);
        const spend = await chargeCredits(await wsRow(workspaceId), overGrant, "test");
        expect(spend.ok).toBe(true);
        expect(spend.remaining).toBe(0);
    });

    it("a refund puts the credits straight back", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setBalance(workspaceId, 100);
        const spend = await chargeCredits(await wsRow(workspaceId), 40, "test");
        await settleCredits(await wsRow(workspaceId), spend.entryId!, -30);
        expect((await wsRow(workspaceId)).aiCreditsBalance).toBe(90);
    });

    it("never drives the balance below zero on a settle that bills beyond the reserve", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setBalance(workspaceId, 10);
        const spend = await chargeCredits(await wsRow(workspaceId), 10, "test");
        await settleCredits(await wsRow(workspaceId), spend.entryId!, 999);
        expect((await wsRow(workspaceId)).aiCreditsBalance).toBe(0);
    });

    it("a settled charge stays one ledger row, rewritten in place", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setBalance(workspaceId, 40);

        const spend = await chargeCredits(await wsRow(workspaceId), 40, "test");
        expect((await ledgerOf(workspaceId))[0]!.balanceAfter).toBe(0);

        await settleCredits(await wsRow(workspaceId), spend.entryId!, -40);
        const rows = await ledgerOf(workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.id).toBe(spend.entryId);
        expect(rows[0]!.delta).toBe(0); // charged 40, owed 0
        expect(rows[0]!.balanceAfter).toBe(40);
    });

    it("records what the charge bought, so history reads as work not just a tool name", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const spend = await chargeCredits(
            await wsRow(workspaceId),
            27,
            "generate-artifact",
            undefined,
            { plan: 1, section: 12 },
        );
        await settleCredits(await wsRow(workspaceId), spend.entryId!, -3);
        const [row] = await ledgerOf(workspaceId);
        expect(row!.usage).toEqual({ plan: 1, section: 12 }); // survives the settle
        expect(row!.delta).toBe(-24);
    });

    it("a settle that bills beyond the reserve deepens the same row", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setBalance(workspaceId, 100);

        const spend = await chargeCredits(await wsRow(workspaceId), 10, "ask-assistant");
        await settleCredits(await wsRow(workspaceId), spend.entryId!, 15);
        const rows = await ledgerOf(workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.delta).toBe(-25); // reserved 10, really cost 25
        expect(rows[0]!.reason).toBe("ask-assistant"); // no ":settle" suffix to decode
    });
});

describe("rollIfLapsed", () => {
    it("rolls a lapsed window once under concurrency", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await db
            .update(schema.workspaces)
            .set({ aiCreditsBalance: 200, creditsResetAt: new Date(Date.now() - 1000) })
            .where(eq(schema.workspaces.id, workspaceId));
        const ws = await wsRow(workspaceId);

        const results = await Promise.all([rollIfLapsed(ws), rollIfLapsed(ws), rollIfLapsed(ws)]);
        expect(results.filter(Boolean)).toHaveLength(1);

        const rows = await ledgerOf(workspaceId);
        expect(rows.filter((r) => r.reason === "monthly-grant")).toHaveLength(1);
        expect(rows[0]!.key).toMatch(/^roll:/); // the window it closed is the idempotency claim
        const after = await wsRow(workspaceId);
        expect(after.aiCreditsBalance).toBe(200 + grantFor(ws)); // granted once, not thrice
        expect(after.creditsStartedAt.getTime()).toBeLessThan(after.creditsResetAt.getTime());
    });

    // one path for every plan: a live subscription rolls here too, whatever its interval
    it("rolls a subscribed workspace the same way", async () => {
        const { workspaceId } = await seedUser({ plan: "premium" });
        await db
            .update(schema.workspaces)
            .set({
                stripeSubscriptionId: "sub_live",
                planInterval: "month",
                seats: 4,
                aiCreditsBalance: 0,
                creditsResetAt: new Date(Date.now() - 1000),
            })
            .where(eq(schema.workspaces.id, workspaceId));
        const ws = await wsRow(workspaceId);
        expect(await rollIfLapsed(ws)).not.toBeNull();
        expect((await wsRow(workspaceId)).aiCreditsBalance).toBe(grantFor(ws)); // 4 seats' worth
        expect(await rollIfLapsed(await wsRow(workspaceId))).toBeNull(); // and only once
    });

    it("does nothing while the window is still open", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await db
            .update(schema.workspaces)
            .set({ creditsResetAt: new Date(Date.now() + 86_400_000) })
            .where(eq(schema.workspaces.id, workspaceId));
        expect(await rollIfLapsed(await wsRow(workspaceId))).toBeNull();
    });

    // the point of the whole design: a quiet month funds a busy one
    it("adds the grant to the leftovers rather than replacing them", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await db
            .update(schema.workspaces)
            .set({ aiCreditsBalance: 250, creditsResetAt: new Date(Date.now() - 1000) })
            .where(eq(schema.workspaces.id, workspaceId));
        const ws = await wsRow(workspaceId);
        const grant = grantFor(ws);
        await rollIfLapsed(ws);
        const [row] = await ledgerOf(workspaceId);
        expect(row!.reason).toBe("monthly-grant");
        expect(row!.delta).toBe(grant); // money in, not a counter being wiped
        expect(row!.balanceAfter).toBe(250 + grant);
        expect((await wsRow(workspaceId)).aiCreditsBalance).toBe(250 + grant);
    });
});

describe("the rollover cap at the roll", () => {
    const lapse = (id: string, also: Partial<typeof schema.workspaces.$inferInsert> = {}) =>
        db
            .update(schema.workspaces)
            .set({ creditsResetAt: new Date(Date.now() - 1000), ...also })
            .where(eq(schema.workspaces.id, id));

    it("clips the grant to the remaining headroom", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const ws0 = await wsRow(workspaceId);
        const cap = rolloverCapFor(ws0); // 2400 on pro
        await lapse(workspaceId, { aiCreditsBalance: cap - 100 });
        await rollIfLapsed(await wsRow(workspaceId));
        const [row] = await ledgerOf(workspaceId);
        expect(row!.delta).toBe(100);
        expect((await wsRow(workspaceId)).aiCreditsBalance).toBe(cap);
    });

    it("grants nothing at the cap but still re-anchors the window and writes the row", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const ws0 = await wsRow(workspaceId);
        await lapse(workspaceId, { aiCreditsBalance: rolloverCapFor(ws0) });
        const before = (await wsRow(workspaceId)).creditsResetAt;
        await rollIfLapsed(await wsRow(workspaceId));
        const after = await wsRow(workspaceId);
        expect(after.aiCreditsBalance).toBe(rolloverCapFor(ws0));
        expect(after.creditsResetAt.getTime()).toBeGreaterThan(before.getTime());
        const [row] = await ledgerOf(workspaceId);
        expect(row).toMatchObject({ reason: "monthly-grant", delta: 0 });
    });

    it("grants on top of a banked pack, and clamps the purchase to the balance", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const ws0 = await wsRow(workspaceId);
        const cap = rolloverCapFor(ws0);
        const grant = grantFor(ws0);
        // a banked pack that puts the balance over the cap: the grant still lands in full
        const banked = cap + 400;
        await lapse(workspaceId, { aiCreditsBalance: banked, purchasedCredits: 2000 });
        await rollIfLapsed(await wsRow(workspaceId));
        expect((await wsRow(workspaceId)).aiCreditsBalance).toBe(banked + grant);
        expect(banked).toBeGreaterThan(cap);

        // heavy spend since the purchase: the shield follows the balance down at the next roll,
        // clamped against the PRE-grant balance so the fresh grant never counts as pack credits
        await lapse(workspaceId, { aiCreditsBalance: 500, purchasedCredits: 2000 });
        await rollIfLapsed(await wsRow(workspaceId));
        const after = await wsRow(workspaceId);
        expect(after.aiCreditsBalance).toBe(500 + grant);
        expect(after.purchasedCredits).toBe(500);
    });

    // What the cap has to leave room for: a workspace that opens on its allowance and has spent
    // nothing is exactly one grant below its own ceiling, so the first roll lands in full.
    it("gives a fresh free workspace its whole grant at the first roll", async () => {
        const { workspaceId } = await seedUser();
        const ws0 = await wsRow(workspaceId);
        const grant = grantFor(ws0);
        expect(ws0.aiCreditsBalance).toBe(grant); // opens on the allowance, nothing on top of it
        await lapse(workspaceId);
        await rollIfLapsed(await wsRow(workspaceId));
        const [row] = await ledgerOf(workspaceId);
        expect(row).toMatchObject({ reason: "monthly-grant", delta: grant });
        expect((await wsRow(workspaceId)).aiCreditsBalance).toBe(rolloverCapFor(ws0));
    });

    it("a fully spent pack decays to zero and later rolls bank only to the cap", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const ws0 = await wsRow(workspaceId);
        const cap = rolloverCapFor(ws0);
        const grant = grantFor(ws0);
        // the pack is gone; nothing of it is banked, so nothing of it should shield future grants
        await lapse(workspaceId, { aiCreditsBalance: 0, purchasedCredits: 2000 });
        await rollIfLapsed(await wsRow(workspaceId));
        expect((await wsRow(workspaceId)).purchasedCredits).toBe(0);
        expect((await wsRow(workspaceId)).aiCreditsBalance).toBe(grant);
        // untouched months converge on the cap, not cap + a ghost of the spent pack
        for (let i = 0; i < 3; i++) {
            await lapse(workspaceId);
            await rollIfLapsed(await wsRow(workspaceId));
        }
        expect((await wsRow(workspaceId)).aiCreditsBalance).toBe(cap);
    });
});
