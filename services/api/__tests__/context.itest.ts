import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authed, seedUser } from "../../test/harness";
import { db, schema } from "../../schema";

// Integration: the lazy monthly-credit-window rollover in currentWorkspace() (services/api/context.ts).
// The clock is exercised by writing timestamps directly — set creditsResetAt in the past, hit any route
// that reads the workspace (GET /features calls currentWorkspace), and assert the window rolled over.

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

describe("credit-window rollover (currentWorkspace)", () => {
    it("zeroes aiCreditsUsed and pushes creditsResetAt ~30 days out once the window has passed", async () => {
        const { userId, workspaceId } = await seedUser();
        // Simulate a spent, expired window.
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
