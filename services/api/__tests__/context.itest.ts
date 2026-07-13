import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authed, seedUser } from "../../__tests__/harness";
import { db, schema } from "../../schema";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

describe("credit-window rollover (currentWorkspace)", () => {
    it("zeroes aiCreditsUsed and pushes creditsResetAt ~30 days out once the window has passed", async () => {
        const { userId, workspaceId } = await seedUser();
        await db
            .update(schema.workspaces)
            .set({ aiCreditsUsed: 99, creditsResetAt: new Date(Date.now() - 60_000) })
            .where(eq(schema.workspaces.id, workspaceId));

        const before = Date.now();
        const res = await authed(userId, "/features"); // reads the workspace → triggers the rollover
        expect(res.status).toBe(200);

        const [ws] = await db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, workspaceId));
        expect(ws!.aiCreditsUsed).toBe(0);
        const reset = ws!.creditsResetAt.getTime();
        expect(reset).toBeGreaterThan(before + THIRTY_DAYS - 60_000);
        expect(reset).toBeLessThan(Date.now() + THIRTY_DAYS + 60_000);
    });

    it("leaves an unexpired window untouched (no premature reset)", async () => {
        const { userId, workspaceId } = await seedUser();
        const future = new Date(Date.now() + THIRTY_DAYS);
        await db
            .update(schema.workspaces)
            .set({ aiCreditsUsed: 42, creditsResetAt: future })
            .where(eq(schema.workspaces.id, workspaceId));

        const res = await authed(userId, "/features");
        expect(res.status).toBe(200);

        const [ws] = await db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, workspaceId));
        expect(ws!.aiCreditsUsed).toBe(42);
        expect(ws!.creditsResetAt.getTime()).toBe(future.getTime());
    });
});
