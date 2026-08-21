import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import type { MediaItem } from "@model/media";
import { assetIdFromUrl, assetUrl } from "@model/media";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import {
    adoptUrls,
    adoptContentMedia,
    libraryAssets,
    readAsset,
    refImage,
    storeGenerated,
    storeUpload,
    useItem,
} from "@services/core/media";
import { seedUser } from "@services/__tests__/harness";

const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const B64 = PNG.toString("base64");
const OTHER = Buffer.from("89504e470d0a1a0b", "hex").toString("base64");
// usedAt ordering is asserted below; a small pause keeps millisecond timestamps distinct
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

const rowsFor = (workspaceId: string) =>
    db.select().from(schema.assets).where(eq(schema.assets.workspaceId, workspaceId));

const items = async (workspaceId: string): Promise<MediaItem[]> =>
    (await libraryAssets(workspaceId)).items;

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

const contentWith = (...urls: string[]): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    background: { kind: "image", image: urls[0]! },
    sections: [
        {
            id: "s1",
            root: {
                type: "group",
                data: {
                    children: urls.map((src) => ({ type: "image", data: { src } })),
                },
            },
        },
    ],
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
        expect(row!.origin).toBeNull();
        expect(row!.sha256).toHaveLength(64);

        expect(await readAsset(item.id)).toMatchObject({ data: B64, mime: "image/png" });

        const library = await items(workspaceId);
        expect(library).toHaveLength(1);
        expect(library[0]!.thumbUrl).toBe(item.url);
    });

    it("charges identical bytes once, however many times they are uploaded", async () => {
        const { workspaceId } = await seedUser();
        const a = await storeUpload(workspaceId, { data: B64, mime: "image/png", name: "a.png" });
        const b = await storeUpload(workspaceId, { data: B64, mime: "image/png", name: "b.png" });
        expect(b.id).toBe(a.id);
        expect(await rowsFor(workspaceId)).toHaveLength(1);
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

        const library = await items(workspaceId);
        expect(library[0]!.prompt).toBe(prompt);
        expect(library[0]!.width).toBe(1536);
    });

    it("lists a generated clip alongside images, and serves its bytes", async () => {
        const { workspaceId } = await seedUser();
        const clip = await storeGenerated(
            workspaceId,
            "video",
            { dataBase64: B64, mime: "video/mp4", width: 1280, height: 720 },
            "a slow pan",
        );
        await storeUpload(workspaceId, { data: OTHER, mime: "image/png" });

        expect((await items(workspaceId)).map((r) => r.id)).toContain(clip.id);
        expect((await libraryAssets(workspaceId, { kind: "image" })).items).toHaveLength(1);
        expect(await readAsset(clip.id)).toMatchObject({ data: B64, mime: "video/mp4" });
    });
});

describe("useItem — what picking media does to the library", () => {
    it("records a stock pick as a reference costing no stored bytes, deduped per origin", async () => {
        const { workspaceId } = await seedUser();
        const first = await useItem(workspaceId, stockItem());
        await tick();
        const again = await useItem(workspaceId, stockItem());

        const rows = await rowsFor(workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.bytes).toBeNull();
        expect(rows[0]!.data).toBeNull();
        expect(rows[0]!.origin).toBe("https://cdn.example/photo-42.jpg");

        // the picker commits what comes back, so it must be the canonical url both times
        expect(first.url).toBe(assetUrl(rows[0]!.id));
        expect(again.url).toBe(first.url);

        const library = await items(workspaceId);
        expect(library[0]!.thumbUrl).toBe("https://cdn.example/photo-42-thumb.jpg");
        expect(library[0]!.attribution?.author).toBe("Ann");
    });

    it("bumps a re-used library asset without duplicating it", async () => {
        const { workspaceId } = await seedUser();
        const first = await storeUpload(workspaceId, { data: B64, mime: "image/png" });
        await tick();
        await storeUpload(workspaceId, { data: OTHER, mime: "image/png" });
        await tick();

        await useItem(workspaceId, { ...stockItem(), id: first.id, url: first.url });

        expect((await items(workspaceId)).map((r) => r.id)[0]).toBe(first.id);
        expect(await rowsFor(workspaceId)).toHaveLength(2);
    });

    it("adopts a plain url as a link so it still lands in the library", async () => {
        const { workspaceId } = await seedUser();
        const picked = await useItem(
            workspaceId,
            stockItem({ source: "upload", url: "https://x.example/a.png" }),
        );
        const rows = await rowsFor(workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.source).toBe("link");
        expect(picked.url).toBe(assetUrl(rows[0]!.id));
    });
});

describe("adopting urls out of artifact content", () => {
    it("rewrites every media reference to a canonical url", async () => {
        const { workspaceId } = await seedUser();
        const content = contentWith(
            "https://images.unsplash.com/photo-1.jpg",
            "https://picsum.photos/seed/x/800/600",
        );
        const next = (await adoptContentMedia(workspaceId, content)) as ArtifactContent;

        const bg = next.background!.image!;
        const srcs = (next.sections[0]!.root.data as { children: { data: { src: string } }[] })
            .children;
        for (const url of [bg, ...srcs.map((c) => c.data.src)])
            expect(assetIdFromUrl(url)).toBeTruthy();

        const rows = await rowsFor(workspaceId);
        expect(rows).toHaveLength(2); // the background reuses the first image's row
        expect(rows.map((r) => r.source).sort()).toEqual(["link", "stock"]);
        expect(rows.every((r) => r.data === null)).toBe(true); // adopted, so no stored bytes
    });

    it("leaves canonical content untouched, and does no work for it", async () => {
        const { workspaceId } = await seedUser();
        const once = await adoptContentMedia(workspaceId, contentWith("https://x.example/a.png"));
        const twice = await adoptContentMedia(workspaceId, once);
        expect(twice).toBe(once); // identity: nothing to rewrite, nothing rebuilt
        expect(await rowsFor(workspaceId)).toHaveLength(1);
    });

    it("adopts a clip as video, and its poster as an image", async () => {
        const { workspaceId } = await seedUser();
        await adoptContentMedia(workspaceId, {
            format: "deck",
            theme: "studio",
            sections: [
                {
                    id: "s1",
                    root: {
                        type: "video",
                        data: {
                            src: "https://cdn.example/clip.mp4",
                            poster: "https://cdn.example/poster.jpg",
                        },
                    },
                },
            ],
        });
        const rows = await rowsFor(workspaceId);
        expect(rows.find((r) => r.origin!.endsWith(".mp4"))!.kind).toBe("video");
        expect(rows.find((r) => r.origin!.endsWith(".jpg"))!.kind).toBe("image");
    });

    it("upgrades a link to stock when the same url is later picked from a provider", async () => {
        const { workspaceId } = await seedUser();
        const url = "https://cdn.example/photo-42.jpg";
        await adoptUrls(workspaceId, [url]); // seen in content first: a bare link
        expect((await rowsFor(workspaceId))[0]!.source).toBe("link");

        await useItem(workspaceId, stockItem({ url }));
        const [row] = await rowsFor(workspaceId);
        expect(row!.source).toBe("stock");
        expect((row!.meta as { attribution?: { author?: string } }).attribution?.author).toBe(
            "Ann",
        );
    });

    it("leaves a platform video link alone", async () => {
        const { workspaceId } = await seedUser();
        const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        const ids = await adoptUrls(workspaceId, [url]);
        expect(ids.size).toBe(0);
        expect(await rowsFor(workspaceId)).toHaveLength(0);
    });
});

describe("content copied between workspaces", () => {
    it("takes ownership of a reference that belongs to another workspace", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const theirUpload = await storeUpload(theirs.workspaceId, { data: B64, mime: "image/png" });
        const theirStock = await useItem(theirs.workspaceId, stockItem());

        const copied = (await adoptContentMedia(
            mine.workspaceId,
            contentWith(theirUpload.url, theirStock.url),
        )) as ArtifactContent;

        const srcs = (
            copied.sections[0]!.root.data as { children: { data: { src: string } }[] }
        ).children.map((c) => c.data.src);
        const ids = srcs.map((u) => assetIdFromUrl(u)!);
        expect(ids.every(Boolean)).toBe(true);
        // repointed at rows this workspace owns, not at the originals
        expect(ids).not.toContain(theirUpload.id);
        expect(ids).not.toContain(theirStock.id);

        const rows = await rowsFor(mine.workspaceId);
        expect(rows).toHaveLength(2);
        expect(rows.find((r) => r.data !== null)!.sha256).toBeTruthy(); // bytes came across
        expect(rows.find((r) => r.origin !== null)!.origin).toBe(
            "https://cdn.example/photo-42.jpg",
        );
        // and the other tenant still has its own
        expect(await rowsFor(theirs.workspaceId)).toHaveLength(2);
    });
});

describe("tenant scoping", () => {
    it("keeps the library and generation refs inside the workspace", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const item = await storeUpload(mine.workspaceId, { data: B64, mime: "image/png" });
        await storeUpload(theirs.workspaceId, { data: B64, mime: "image/png" });

        expect(await items(mine.workspaceId)).toHaveLength(1);
        expect(await refImage(mine.workspaceId, item.id)).toEqual({
            data: B64,
            mime: "image/png",
        });
        // the other tenant can't feed my asset into their generation
        expect(await refImage(theirs.workspaceId, item.id)).toBeNull();
    });

    it("never hands a byte-less reference to the generator", async () => {
        const { workspaceId } = await seedUser();
        await useItem(workspaceId, stockItem());
        const [row] = await rowsFor(workspaceId);
        expect(await refImage(workspaceId, row!.id)).toBeNull();
    });
});
