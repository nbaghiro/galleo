import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { MediaItem } from "@model/media";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import {
    assetUrl,
    readAssetBytes,
    recentAssets,
    refImage,
    storeGenerated,
    storeUpload,
    useItem,
} from "@services/core/media";
import { seedUser } from "@services/__tests__/harness";

const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const B64 = PNG.toString("base64");
// createdAt ordering is asserted below; a small pause keeps millisecond timestamps distinct
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

const rowsFor = (workspaceId: string) =>
    db.select().from(schema.assets).where(eq(schema.assets.workspaceId, workspaceId));

const stockItem = (over: Partial<MediaItem> = {}): MediaItem => ({
    id: "pexels-42",
    source: "stock",
    url: "https://cdn.example/photo-42.jpg",
    thumbUrl: "https://cdn.example/photo-42-thumb.jpg",
    width: 1200,
    height: 800,
    alt: "a heron",
    attribution: { provider: "Pexels", author: "Ann", sourceUrl: "https://pexels.example/42" },
    ...over,
});

describe("uploads and generated assets", () => {
    it("stores an upload and serves its bytes back through the library", async () => {
        const { workspaceId } = await seedUser();
        const item = await storeUpload(workspaceId, {
            data: B64,
            mime: "image/png",
            name: "logo.png",
            width: 10,
            height: 5,
        });
        expect(item.url).toBe(assetUrl(item.id));

        const [row] = await rowsFor(workspaceId);
        expect(row!.bytes).toBe(PNG.length);
        expect(row!.source).toBe("upload");

        const bytes = await readAssetBytes(item.id);
        expect(bytes).toEqual({ data: B64, mime: "image/png" });

        const recent = await recentAssets(workspaceId);
        expect(recent).toHaveLength(1);
        expect(recent[0]!.thumbUrl).toBe(item.url);
        expect(recent[0]!.alt).toBe("logo.png");
    });

    it("keeps the generation prompt, truncating only the alt to 160 characters", async () => {
        const { workspaceId } = await seedUser();
        const prompt = "p".repeat(200);
        const item = await storeGenerated(
            workspaceId,
            "image",
            { dataBase64: B64, mime: "image/png", width: 1536, height: 1024 },
            prompt,
        );
        expect(item.alt).toHaveLength(160);
        expect(item.prompt).toBe(prompt);

        const recent = await recentAssets(workspaceId);
        expect(recent[0]!.prompt).toBe(prompt);
        expect(recent[0]!.width).toBe(1536);
    });

    it("keeps video out of the picker's Recent tab but still serves its bytes", async () => {
        const { workspaceId } = await seedUser();
        const clip = await storeGenerated(
            workspaceId,
            "video",
            { dataBase64: B64, mime: "video/mp4", width: 1280, height: 720 },
            "a slow pan",
        );
        await storeUpload(workspaceId, { data: B64, mime: "image/png" });

        const recent = await recentAssets(workspaceId);
        expect(recent).toHaveLength(1);
        expect(recent.map((r) => r.id)).not.toContain(clip.id);
        expect(await readAssetBytes(clip.id)).toEqual({ data: B64, mime: "video/mp4" });
    });
});

describe("useItem — what picking media does to the library", () => {
    it("records a stock pick as a CDN reference costing no stored bytes, deduped per URL", async () => {
        const { workspaceId } = await seedUser();
        await useItem(workspaceId, stockItem());
        await tick();
        await useItem(workspaceId, stockItem());

        const rows = await rowsFor(workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.bytes).toBeNull();
        expect(rows[0]!.data).toBeNull();

        const recent = await recentAssets(workspaceId);
        expect(recent[0]!.thumbUrl).toBe("https://cdn.example/photo-42-thumb.jpg");
        expect(recent[0]!.attribution?.author).toBe("Ann");
    });

    it("bumps a re-used library asset to the top of Recent without duplicating it", async () => {
        const { workspaceId } = await seedUser();
        const first = await storeUpload(workspaceId, { data: B64, mime: "image/png", name: "a" });
        await tick();
        await storeUpload(workspaceId, { data: B64, mime: "image/png", name: "b" });
        await tick();

        await useItem(workspaceId, {
            id: first.id,
            source: "upload",
            url: first.url,
            thumbUrl: first.url,
            width: 0,
            height: 0,
        });

        const recent = await recentAssets(workspaceId);
        expect(recent.map((r) => r.alt)).toEqual(["a", "b"]);
        expect(await rowsFor(workspaceId)).toHaveLength(2);
    });

    it("ignores a non-stock item that is not in the library", async () => {
        const { workspaceId } = await seedUser();
        await useItem(workspaceId, stockItem({ source: "upload", url: "https://x.example/a.png" }));
        expect(await rowsFor(workspaceId)).toHaveLength(0);
    });
});

describe("tenant scoping", () => {
    it("keeps recents and generation refs inside the workspace", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const item = await storeUpload(mine.workspaceId, { data: B64, mime: "image/png" });
        await storeUpload(theirs.workspaceId, { data: B64, mime: "image/png" });

        expect(await recentAssets(mine.workspaceId)).toHaveLength(1);
        expect(await refImage(mine.workspaceId, item.id)).toEqual({
            data: B64,
            mime: "image/png",
        });
        // the other tenant can't feed my asset into their generation
        expect(await refImage(theirs.workspaceId, item.id)).toBeNull();
    });

    it("never hands a byte-less stock reference to the generator", async () => {
        const { workspaceId } = await seedUser();
        await useItem(workspaceId, stockItem());
        const [row] = await rowsFor(workspaceId);
        expect(await refImage(workspaceId, row!.id)).toBeNull();
    });
});
