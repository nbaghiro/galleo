import { describe, expect, it } from "vitest";
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
            url: "https://images.example/cdn/x.jpg",
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
