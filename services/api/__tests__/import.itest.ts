import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import PptxGenJS from "pptxgenjs";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import type { ArtifactContent } from "@model/artifact";

const PNG_1PX =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function deckBase64(): Promise<string> {
    const pptx = new PptxGenJS();
    pptx.title = "Route Deck";
    const s = pptx.addSlide();
    s.addText("Route title", { x: 1, y: 0.5, w: 8, h: 1, fontSize: 36 });
    s.addImage({ data: `image/png;base64,${PNG_1PX}`, x: 1, y: 2, w: 3, h: 2 });
    const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    return buf.toString("base64");
}

describe("POST /import/pptx", () => {
    it("parses a deck, stores its pictures, and answers content", async () => {
        const { userId, workspaceId } = await seedUser();
        const res = await authed(
            userId,
            "/import/pptx",
            jsonInit("POST", { name: "route.pptx", data: await deckBase64() }),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { content: ArtifactContent; title: string };
        expect(body.title).toBe("Route Deck");
        expect(body.content.sections).toHaveLength(1);
        expect(JSON.stringify(body.content)).toContain("Route title");

        const assets = await db
            .select()
            .from(schema.assets)
            .where(eq(schema.assets.workspaceId, workspaceId));
        expect(assets).toHaveLength(1);
        expect(JSON.stringify(body.content)).toContain(assets[0]!.id);
    });

    it("402s with an upgrade hint when the pictures would exceed storage", async () => {
        const { userId, workspaceId } = await seedUser();
        await db
            .update(schema.workspaces)
            .set({ featureOverrides: { storageMb: 0 } })
            .where(eq(schema.workspaces.id, workspaceId));
        const res = await authed(
            userId,
            "/import/pptx",
            jsonInit("POST", { name: "route.pptx", data: await deckBase64() }),
        );
        expect(res.status).toBe(402);
        expect(await res.json()).toMatchObject({ error: "storage limit reached", upgrade: true });
    });

    it("400s on bytes that are not a presentation", async () => {
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/import/pptx",
            jsonInit("POST", { name: "x.pptx", data: Buffer.from("nope").toString("base64") }),
        );
        expect(res.status).toBe(400);
    });
});

describe("POST /import/slides", () => {
    it("400s a link that is not Google Slides without fetching", async () => {
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/import/slides",
            jsonInit("POST", { url: "https://example.com/deck" }),
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("Google Slides");
    });
});
