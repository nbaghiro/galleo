import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

/**
 * The billing half of the same seam. Its own file because it turns the scripted model ON
 * (`GALLEO_FAKE_AI`, which is what `aiReady()` consults) so the route gets past its configuration
 * check and reaches the reserve, while ai.itest.ts asserts what an UNCONFIGURED server does.
 * Sharing a file makes the two depend on hook ordering, which is how the first draft of this test
 * broke three of theirs.
 *
 * What is asserted is the tenant the hold lands on, not the amount: the run settles back to almost
 * nothing, and the question worth pinning is whose credits were reachable at all.
 */
describe("POST /ai/notes bills the artifact's workspace", () => {
    let savedFake: string | undefined;
    beforeAll(() => {
        savedFake = process.env.GALLEO_FAKE_AI;
        process.env.GALLEO_FAKE_AI = "1";
    });
    afterAll(() => {
        if (savedFake === undefined) delete process.env.GALLEO_FAKE_AI;
        else process.env.GALLEO_FAKE_AI = savedFake;
    });

    const ledgerRows = async (workspaceId: string): Promise<number> => {
        const rows = await db
            .select({ id: schema.credits.id })
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        return rows.length;
    };

    it("holds against the owner, never the invited collaborator", async () => {
        const owner = await seedUser({ plan: "pro" });
        const guest = await seedUser({ plan: "pro" });
        const [a] = await db
            .insert(schema.artifacts)
            .values({
                workspaceId: owner.workspaceId,
                draftContent: {
                    format: "deck",
                    theme: "studio",
                    sections: [
                        { id: "s1", root: { type: "text", data: { text: "A real headline" } } },
                    ],
                } as typeof schema.artifacts.$inferInsert.draftContent,
            })
            .returning({ id: schema.artifacts.id });
        await db.insert(schema.artifactGrants).values({
            artifactId: a!.id,
            workspaceId: owner.workspaceId,
            email: "notes-billing@test.local",
            userId: guest.userId,
            access: "edit",
        });

        const guestBefore = await ledgerRows(guest.workspaceId);
        const ownerBefore = await ledgerRows(owner.workspaceId);

        const res = await authed(
            guest.userId,
            "/ai/notes",
            jsonInit("POST", {
                artifactId: a!.id,
                content: {
                    format: "deck",
                    theme: "studio",
                    sections: [
                        { id: "s1", root: { type: "text", data: { text: "A real headline" } } },
                    ],
                },
            }),
        );
        expect(res.status).toBe(200);
        await res.text(); // drain the SSE body so the settle runs

        expect(await ledgerRows(guest.workspaceId)).toBe(guestBefore);
        expect(await ledgerRows(owner.workspaceId)).toBeGreaterThan(ownerBefore);
    });
});
