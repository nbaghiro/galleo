import { describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { creditLimitFor } from "@model/billing";
import { seedUser } from "../../__tests__/harness";
import { db } from "../../db/client";
import { schema } from "../../db/schema";
import { chargeCredits, rollCreditWindow, settleCredits } from "../ledger";

const wsRow = async (id: string) => {
    const [row] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
    return row!;
};

const setCredits = (id: string, used: number, bonus: number) =>
    db
        .update(schema.workspaces)
        .set({ aiCreditsUsed: used, aiCreditsBonus: bonus })
        .where(eq(schema.workspaces.id, id));

const ledgerOf = (id: string) =>
    db
        .select()
        .from(schema.credits)
        .where(eq(schema.credits.workspaceId, id))
        .orderBy(desc(schema.credits.createdAt));

describe("bonus-aware refunds", () => {
    it("reports how much of a charge bonus covered", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const ws = await wsRow(workspaceId);
        const limit = creditLimitFor(ws);
        await setCredits(workspaceId, limit - 10, 50); // 10 pool room + 50 bonus

        const spend = await chargeCredits(await wsRow(workspaceId), 30, "test");
        expect(spend.ok).toBe(true);
        expect(spend.fromBonus).toBe(20); // 10 from pool, the rest from bonus
    });

    it("a refund restores bonus before pool, in reverse spend order", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const ws = await wsRow(workspaceId);
        const limit = creditLimitFor(ws);
        await setCredits(workspaceId, limit - 10, 50);

        const spend = await chargeCredits(await wsRow(workspaceId), 30, "test");
        await settleCredits(await wsRow(workspaceId), spend.entryId!, -30, spend.fromBonus);

        const after = await wsRow(workspaceId);
        expect(after.aiCreditsBonus).toBe(50); // paid credits fully restored
        expect(after.aiCreditsUsed).toBe(limit - 10); // and the pool part too
    });

    it("a fully bonus-funded charge refunds only bonus", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const ws = await wsRow(workspaceId);
        const limit = creditLimitFor(ws);
        await setCredits(workspaceId, limit, 100); // pool exhausted

        const spend = await chargeCredits(await wsRow(workspaceId), 60, "test");
        expect(spend.fromBonus).toBe(60);
        await settleCredits(await wsRow(workspaceId), spend.entryId!, -60, spend.fromBonus);

        const after = await wsRow(workspaceId);
        expect(after.aiCreditsBonus).toBe(100);
        expect(after.aiCreditsUsed).toBe(limit); // the pool never sees a phantom credit
    });

    it("a partial refund spills to the pool only after bonus is made whole", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const ws = await wsRow(workspaceId);
        const limit = creditLimitFor(ws);
        await setCredits(workspaceId, limit - 10, 50);

        const spend = await chargeCredits(await wsRow(workspaceId), 30, "test"); // 10 pool + 20 bonus
        await settleCredits(await wsRow(workspaceId), spend.entryId!, -25, spend.fromBonus);

        const after = await wsRow(workspaceId);
        expect(after.aiCreditsBonus).toBe(50); // all 20 bonus back
        expect(after.aiCreditsUsed).toBe(limit - 5); // 5 of the 10 pool back
    });

    it("a settled charge stays one ledger row, rewritten in place", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const ws = await wsRow(workspaceId);
        const limit = creditLimitFor(ws);
        await setCredits(workspaceId, limit, 40);

        const spend = await chargeCredits(await wsRow(workspaceId), 40, "test");
        expect((await ledgerOf(workspaceId))[0]!.balanceAfter).toBe(0);

        await settleCredits(await wsRow(workspaceId), spend.entryId!, -40, spend.fromBonus);
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
        await setCredits(workspaceId, 0, 0);

        const spend = await chargeCredits(await wsRow(workspaceId), 10, "ask-assistant");
        await settleCredits(await wsRow(workspaceId), spend.entryId!, 15, spend.fromBonus);
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

    it("includes bonus in the reset row's balance", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await db
            .update(schema.workspaces)
            .set({
                aiCreditsUsed: 100,
                aiCreditsBonus: 500,
                creditsResetAt: new Date(Date.now() - 1000),
            })
            .where(eq(schema.workspaces.id, workspaceId));
        const ws = await wsRow(workspaceId);
        await rollCreditWindow(ws);
        const [reset] = await ledgerOf(workspaceId);
        expect(reset!.reason).toBe("monthly-reset");
        expect(reset!.balanceAfter).toBe(creditLimitFor(ws) + 500);
    });
});
