import { describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { authed, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { chargeCredits } from "@services/core/ledger";

const wsOf = async (workspaceId: string) => {
    const [row] = await db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, workspaceId));
    return row!;
};

// one credit per call, so n calls spend n across n rows
const spend = async (userId: string, workspaceId: string, n: number): Promise<void> => {
    for (let i = 0; i < n; i++)
        await chargeCredits(await wsOf(workspaceId), 1, "ask-assistant", userId);
};

describe("ledger attribution", () => {
    it("records who spent, and the ledger names them", async () => {
        const owner = await seedUser({ plan: "pro" });
        await db
            .update(schema.users)
            .set({ name: "Grace Hopper" })
            .where(eq(schema.users.id, owner.userId));
        await spend(owner.userId, owner.workspaceId, 1);

        const [row] = await db
            .select()
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, owner.workspaceId))
            .orderBy(desc(schema.credits.createdAt))
            .limit(1);
        expect(row!.userId).toBe(owner.userId);
        expect(row!.delta).toBe(-1);

        const page = await (await authed(owner.userId, "/billing/ledger")).json();
        expect(page.entries[0].user).toMatchObject({ name: "Grace Hopper" });
    });

    it("system rows (the monthly grant) carry no user", async () => {
        const owner = await seedUser({ plan: "pro" });
        await spend(owner.userId, owner.workspaceId, 25);
        // expire the window; the next workspace read rolls it and writes the reset row
        await db
            .update(schema.workspaces)
            .set({ creditsResetAt: new Date(Date.now() - 1000) })
            .where(eq(schema.workspaces.id, owner.workspaceId));
        await authed(owner.userId, "/workspace");

        const page = await (await authed(owner.userId, "/billing/ledger")).json();
        const grant = page.entries.find((e: { reason: string }) => e.reason === "monthly-grant");
        expect(grant).toBeTruthy();
        expect(grant.user).toBeNull();
        expect(grant.delta).toBeGreaterThan(0); // money in, not a counter being wiped
    });
});

describe("billing summary", () => {
    it("carries the reset date, storage, and a counted artifact total", async () => {
        const owner = await seedUser({ plan: "pro" });
        await db.insert(schema.artifacts).values([
            { workspaceId: owner.workspaceId },
            { workspaceId: owner.workspaceId },
            {
                workspaceId: owner.workspaceId,
                trashedAt: new Date(),
            },
        ]);
        await db.insert(schema.assets).values({
            workspaceId: owner.workspaceId,
            kind: "image",
            bytes: 3 * 1024 * 1024,
            data: "stored",
            sha256: "a".repeat(64),
        });

        const body = await (await authed(owner.userId, "/billing")).json();
        expect(body.usage.artifacts).toBe(2); // trash doesn't count
        expect(body.usage.storageMb).toBe(3);
        expect(body.usage.maxStorageMb).toBeGreaterThan(0);
        expect(new Date(body.credits.resetAt).getTime()).toBeGreaterThan(Date.now());
    });
});

describe("ledger pagination", () => {
    it("walks pages without repeating or skipping an entry", async () => {
        const owner = await seedUser({ plan: "premium" });
        await spend(owner.userId, owner.workspaceId, 35);

        const first = await (await authed(owner.userId, "/billing/ledger")).json();
        expect(first.entries).toHaveLength(30);
        expect(first.nextCursor).toBeTruthy();

        const second = await (
            await authed(
                owner.userId,
                `/billing/ledger?cursor=${encodeURIComponent(first.nextCursor)}`,
            )
        ).json();
        expect(second.entries).toHaveLength(5);
        expect(second.nextCursor).toBeNull();

        const balances = [...first.entries, ...second.entries].map(
            (e: { balanceAfter: number }) => e.balanceAfter,
        );
        expect(new Set(balances).size).toBe(35); // each spend leaves a distinct balance
    });

    it("shrugs off a malformed cursor", async () => {
        const owner = await seedUser({ plan: "pro" });
        await spend(owner.userId, owner.workspaceId, 5);
        const res = await authed(owner.userId, "/billing/ledger?cursor=garbage");
        expect(res.status).toBe(200);
        expect((await res.json()).entries).toHaveLength(5); // page one, not an error
    });
});
