import { describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { monthlyGrantFor } from "@model/billing";
import { seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { chargeCredits, rollCreditWindow, settleCredits } from "@services/core/ledger";

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
        const overGrant = monthlyGrantFor(await wsRow(workspaceId)) * 4;
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

describe("rollCreditWindow", () => {
    it("rolls a lapsed window once under concurrency", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await db
            .update(schema.workspaces)
            .set({ aiCreditsBalance: 200, creditsResetAt: new Date(Date.now() - 1000) })
            .where(eq(schema.workspaces.id, workspaceId));
        const ws = await wsRow(workspaceId);

        const results = await Promise.all([
            rollCreditWindow(ws),
            rollCreditWindow(ws),
            rollCreditWindow(ws),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);

        const rows = await ledgerOf(workspaceId);
        expect(rows.filter((r) => r.reason === "monthly-grant")).toHaveLength(1);
        const after = await wsRow(workspaceId);
        expect(after.aiCreditsBalance).toBe(200 + monthlyGrantFor(ws)); // granted once, not thrice
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

    // the point of the whole design: a quiet month funds a busy one
    it("adds the grant to the leftovers rather than replacing them", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        await db
            .update(schema.workspaces)
            .set({ aiCreditsBalance: 250, creditsResetAt: new Date(Date.now() - 1000) })
            .where(eq(schema.workspaces.id, workspaceId));
        const ws = await wsRow(workspaceId);
        const grant = monthlyGrantFor(ws);
        await rollCreditWindow(ws);
        const [row] = await ledgerOf(workspaceId);
        expect(row!.reason).toBe("monthly-grant");
        expect(row!.delta).toBe(grant); // money in, not a counter being wiped
        expect(row!.balanceAfter).toBe(250 + grant);
        expect((await wsRow(workspaceId)).aiCreditsBalance).toBe(250 + grant);
    });
});
