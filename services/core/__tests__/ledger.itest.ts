import { describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { creditLimitFor } from "@model/billing";
import { seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { chargeCredits, rollCreditWindow, settleCredits } from "@services/core/ledger";

const wsRow = async (id: string) => {
    const [row] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
    return row!;
};

const setUsed = (id: string, used: number) =>
    db.update(schema.workspaces).set({ aiCreditsUsed: used }).where(eq(schema.workspaces.id, id));

/** Credit blocks are the only way a Pro workspace's limit moves, so tests widen it that way. */
const setBlocks = (id: string, blocks: number) =>
    db.update(schema.workspaces).set({ creditBlocks: blocks }).where(eq(schema.workspaces.id, id));

const ledgerOf = (id: string) =>
    db
        .select()
        .from(schema.credits)
        .where(eq(schema.credits.workspaceId, id))
        .orderBy(desc(schema.credits.createdAt));

describe("chargeCredits", () => {
    it("refuses a charge the allowance cannot cover, and writes no row", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const limit = creditLimitFor(await wsRow(workspaceId));
        await setUsed(workspaceId, limit - 5);

        const spend = await chargeCredits(await wsRow(workspaceId), 30, "test");
        expect(spend.ok).toBe(false);
        expect(spend.remaining).toBe(5);
        expect(spend.entryId).toBeNull();
        expect(await ledgerOf(workspaceId)).toHaveLength(0);
    });

    it("counts a credit block toward the same single allowance", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const base = creditLimitFor(await wsRow(workspaceId));
        await setBlocks(workspaceId, 2);
        const widened = creditLimitFor(await wsRow(workspaceId));
        expect(widened).toBeGreaterThan(base);

        await setUsed(workspaceId, base);
        // would have been refused before the blocks were bought
        const spend = await chargeCredits(await wsRow(workspaceId), 10, "test");
        expect(spend.ok).toBe(true);
        expect(spend.remaining).toBe(widened - base - 10);
    });

    it("a refund puts the credits straight back, since there is only one pool", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setUsed(workspaceId, 0);
        const spend = await chargeCredits(await wsRow(workspaceId), 40, "test");
        expect((await wsRow(workspaceId)).aiCreditsUsed).toBe(40);

        await settleCredits(await wsRow(workspaceId), spend.entryId!, -30);
        expect((await wsRow(workspaceId)).aiCreditsUsed).toBe(10);
    });

    it("never drives usage below zero on an over-refund", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await setUsed(workspaceId, 0);
        const spend = await chargeCredits(await wsRow(workspaceId), 10, "test");
        await settleCredits(await wsRow(workspaceId), spend.entryId!, -999);
        expect((await wsRow(workspaceId)).aiCreditsUsed).toBe(0);
    });

    it("a settled charge stays one ledger row, rewritten in place", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const ws = await wsRow(workspaceId);
        const limit = creditLimitFor(ws);
        await setUsed(workspaceId, limit - 40);

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
        await setUsed(workspaceId, 0);

        const spend = await chargeCredits(await wsRow(workspaceId), 10, "ask-assistant");
        await settleCredits(await wsRow(workspaceId), spend.entryId!, 15);
        const rows = await ledgerOf(workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.delta).toBe(-25); // reserved 10, really cost 25
        expect(rows[0]!.reason).toBe("ask-assistant"); // no ":settle" suffix to decode
    });
});

describe("rollCreditWindow", () => {
    it("rolls a lapsed window once under concurrency", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await db
            .update(schema.workspaces)
            .set({ aiCreditsUsed: 200, creditsResetAt: new Date(Date.now() - 1000) })
            .where(eq(schema.workspaces.id, workspaceId));
        const ws = await wsRow(workspaceId);

        const results = await Promise.all([
            rollCreditWindow(ws),
            rollCreditWindow(ws),
            rollCreditWindow(ws),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);

        const rows = await ledgerOf(workspaceId);
        expect(rows.filter((r) => r.reason === "monthly-reset")).toHaveLength(1);
        const after = await wsRow(workspaceId);
        expect(after.aiCreditsUsed).toBe(0);
        expect(after.creditsStartedAt.getTime()).toBeLessThan(after.creditsResetAt.getTime());
    });

    it("does nothing while the window is still open", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await db
            .update(schema.workspaces)
            .set({ creditsResetAt: new Date(Date.now() + 86_400_000) })
            .where(eq(schema.workspaces.id, workspaceId));
        expect(await rollCreditWindow(await wsRow(workspaceId))).toBeNull();
    });

    // every credit is monthly now, so the roll restores the whole limit including the add-ons
    it("restores the full limit, add-ons included, in the reset row's balance", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await db
            .update(schema.workspaces)
            .set({
                aiCreditsUsed: 100,
                creditBlocks: 3,
                creditsResetAt: new Date(Date.now() - 1000),
            })
            .where(eq(schema.workspaces.id, workspaceId));
        const ws = await wsRow(workspaceId);
        await rollCreditWindow(ws);
        const [reset] = await ledgerOf(workspaceId);
        expect(reset!.reason).toBe("monthly-reset");
        expect(reset!.balanceAfter).toBe(creditLimitFor(ws));
        expect((await wsRow(workspaceId)).aiCreditsUsed).toBe(0);
    });
});
