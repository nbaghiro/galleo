import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

// ~1KB of real base64 so byte accounting is meaningful
const KB_DATA = Buffer.alloc(1024, 7).toString("base64");

const upload = (userId: string) =>
    authed(
        userId,
        "/media/upload",
        jsonInit("POST", { data: KB_DATA, mime: "image/png", name: "t.png" }),
    );

async function setOverrides(workspaceId: string, storageMb: number): Promise<void> {
    await db
        .update(schema.workspaces)
        .set({ featureOverrides: { storageMb } })
        .where(eq(schema.workspaces.id, workspaceId));
}

describe("storage cap", () => {
    it("accepts uploads under the plan cap", async () => {
        const { userId } = await seedUser();
        const res = await upload(userId);
        expect(res.status).toBe(200);
    });

    it("402s with an upgrade hint once stored bytes would exceed the cap", async () => {
        const { userId, workspaceId } = await seedUser();
        await setOverrides(workspaceId, 0); // 0 MB — nothing fits
        const res = await upload(userId);
        expect(res.status).toBe(402);
        const body = await res.json();
        expect(body).toMatchObject({ error: "storage limit reached", upgrade: true });
    });

    it("counts only stored bytes — stock rows are free", async () => {
        const { userId, workspaceId } = await seedUser();
        // just over 1 MB of stored budget: one 1KB upload fits, a stock row must not tip it
        await setOverrides(workspaceId, 1);
        await db.insert(schema.assets).values({
            workspaceId,
            kind: "image",
            source: "stock",
            origin: "https://images.example/cdn/x.jpg",
            bytes: null,
            data: null,
        });
        const res = await upload(userId);
        expect(res.status).toBe(200);
    });

    it("treats -1 as unlimited", async () => {
        const { userId, workspaceId } = await seedUser();
        await setOverrides(workspaceId, -1);
        const res = await upload(userId);
        expect(res.status).toBe(200);
    });
});

describe("the per-member credit cap on generation", () => {
    const REAL_FETCH = globalThis.fetch;
    let savedKey: string | undefined;

    // The provider is the network seam. A 500 makes both routes take their failure path, which still
    // proves what these tests are about: whether the reserve let the caller in at all.
    beforeEach(() => {
        savedKey = process.env.GOOGLE_API_KEY;
        process.env.GOOGLE_API_KEY = "test-key";
        globalThis.fetch = (() =>
            Promise.resolve(new Response("{}", { status: 500 }))) as typeof fetch;
    });
    afterEach(() => {
        globalThis.fetch = REAL_FETCH;
        if (savedKey === undefined) delete process.env.GOOGLE_API_KEY;
        else process.env.GOOGLE_API_KEY = savedKey;
    });

    const join = async (workspaceId: string, role: "admin" | "member"): Promise<string> => {
        const u = await seedUser();
        await db.insert(schema.members).values({ workspaceId, userId: u.userId, role });
        await db
            .update(schema.users)
            .set({ activeWorkspaceId: workspaceId })
            .where(eq(schema.users.id, u.userId));
        return u.userId;
    };

    const generate = (userId: string, path: "/media/generate" | "/media/generate-video") =>
        authed(userId, path, jsonInit("POST", { prompt: "a quiet studio at dusk" }));

    let cast: { owner: string; admin: string; member: string };

    beforeEach(async () => {
        const owner = await seedUser();
        cast = {
            owner: owner.userId,
            admin: await join(owner.workspaceId, "admin"),
            member: await join(owner.workspaceId, "member"),
        };
        // a cap of 0 refuses any member spend whatever the pool holds, so the pool cannot be what
        // a refusal below is measuring
        await db
            .update(schema.workspaces)
            .set({ aiCreditsBalance: 10_000, memberCreditCap: 0 })
            .where(eq(schema.workspaces.id, owner.workspaceId));
    });

    it("refuses a member over their cap and names that wall, not the empty-pool one", async () => {
        for (const path of ["/media/generate", "/media/generate-video"] as const) {
            const res = await generate(cast.member, path);
            expect(res.status).toBe(402);
            expect(await res.json()).toMatchObject({ reason: "member-cap" });
        }
    });

    it("lets an owner and an admin generate over the member cap", async () => {
        for (const path of ["/media/generate", "/media/generate-video"] as const)
            for (const userId of [cast.owner, cast.admin]) {
                const res = await generate(userId, path);
                expect(res.status).toBe(200);
                // the stream ran, so the reserve admitted them rather than 402ing at the door
                expect(await res.text()).toContain("done");
            }
    });
});
