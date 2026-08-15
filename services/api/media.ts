import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { MediaGenStyle, MediaItem, MediaKind, MediaProvider } from "@model/media";
import { featuresFor } from "@model/billing";
import { OUT_OF_CREDITS, readJson } from "@services/utils/http";
import { reserve } from "@services/core/spend";
import {
    generateVideo,
    getIcon,
    imageGenReady,
    readAssetBytes,
    recentAssets,
    refImage,
    searchIcons,
    searchStock,
    stockReady,
    storageFull,
    storeGenerated,
    storeUpload,
    streamImages,
    useItem,
    videoGenReady,
    type GenRef,
} from "@services/core/media";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";

export const media = new Hono<WorkspaceEnv>();

const STORAGE_FULL = { error: "storage limit reached", upgrade: true } as const;
media.get("/media/providers", requireWorkspace, (c) =>
    c.json({ stock: stockReady(), generate: imageGenReady(), generateVideo: videoGenReady() }),
);

media.get("/media/search", requireWorkspace, async (c) => {
    const provider = (c.req.query("provider") ?? "unsplash") as MediaProvider;
    const q = (c.req.query("q") ?? "").trim();
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const orientation = c.req.query("orientation") || undefined;
    const kind = (c.req.query("kind") ?? "photo") as MediaKind;
    if (!q) return c.json({ items: [], page, hasMore: false, providers: stockReady() });
    try {
        const { items, hasMore } = await searchStock(provider, q, page, orientation, kind);
        return c.json({ items, page, hasMore, providers: stockReady() });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "search failed" }, 502);
    }
});

media.get("/media/icons", requireWorkspace, async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ icons: [], total: 0 });
    try {
        const { icons, total } = await searchIcons(q, Number(c.req.query("limit")) || 60);
        return c.json({ icons, total });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "icon search failed" }, 502);
    }
});

media.get("/media/icon", requireWorkspace, async (c) => {
    const id = (c.req.query("id") ?? "").trim();
    if (!id) return c.json({ error: "id required" }, 400);
    try {
        const icon = await getIcon(id);
        return icon ? c.json({ icon }) : c.json({ error: "not found" }, 404);
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "icon fetch failed" }, 502);
    }
});

// Metered per image: reserved up front, reconciled down so failed variations aren't charged.
media.post("/media/generate", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!imageGenReady()) return c.json({ error: "image generation not configured" }, 503);
    const { prompt, aspect, n, style, refId } = await readJson<{
        prompt?: string;
        aspect?: string;
        n?: number;
        style?: MediaGenStyle;
        refId?: string;
    }>(c);
    if (!prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);
    const p = prompt.trim();

    // resolve the refinement base before reserving credits, so a bad ref fails uncharged
    let ref: GenRef | undefined;
    if (refId) {
        const found = await refImage(ws.id, refId);
        if (!found) return c.json({ error: "reference image not found" }, 400);
        ref = found;
    }

    if (await storageFull(ws)) return c.json(STORAGE_FULL, 402);
    const want = Math.max(1, Math.min(4, n ?? 1));
    const held = await reserve(ws, c.get("user").id, "generate-image", { variations: want });
    if (!held.ok) return c.json(OUT_OF_CREDITS(ws, held.remaining), 402);

    return streamSSE(c, (stream) =>
        held.settle(async (billed) => {
            const send = (data: unknown): Promise<void> =>
                stream.writeSSE({ data: JSON.stringify(data) });
            let produced = 0;
            try {
                for await (const img of streamImages(
                    p,
                    aspect,
                    want,
                    style ?? "photo",
                    ref,
                    featuresFor(ws).imageModelTier,
                )) {
                    if (!img) {
                        await send({ type: "fail" });
                        continue;
                    }
                    const item = await storeGenerated(ws.id, "image", img, p);
                    produced++;
                    await send({ type: "image", item });
                }
            } finally {
                billed({ image: produced });
                await send({ type: "done", produced });
            }
        }),
    );
});

// One 8s clip per request; progress heartbeats keep the stream alive while Veo is polled.
media.post("/media/generate-video", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!videoGenReady()) return c.json({ error: "video generation not configured" }, 503);
    const { prompt, aspect } = await readJson<{ prompt?: string; aspect?: string }>(c);
    if (!prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);
    const p = prompt.trim();
    const ar = aspect === "9:16" ? "9:16" : "16:9";

    if (await storageFull(ws)) return c.json(STORAGE_FULL, 402);
    const held = await reserve(ws, c.get("user").id, "generate-video");
    if (!held.ok) return c.json(OUT_OF_CREDITS(ws, held.remaining), 402);

    return streamSSE(c, (stream) =>
        held.settle(async (billed) => {
            const send = (data: unknown): Promise<void> =>
                stream.writeSSE({ data: JSON.stringify(data) });
            let produced = 0;
            try {
                const vid = await generateVideo(p, ar, () => send({ type: "progress" }));
                if (!vid) {
                    await send({ type: "fail", error: "generation timed out" });
                } else {
                    const item = await storeGenerated(ws.id, "video", vid, p);
                    produced = 1;
                    await send({ type: "video", item });
                }
            } catch (e) {
                await send({ type: "fail", error: e instanceof Error ? e.message : "failed" });
            } finally {
                billed({ video: produced });
                await send({ type: "done", produced });
            }
        }),
    );
});

media.post("/media/upload", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    const body = await readJson<{
        data?: string;
        mime?: string;
        name?: string;
        width?: number;
        height?: number;
    }>(c);
    if (!body.data || !body.mime) return c.json({ error: "data and mime are required" }, 400);
    const bytes = Buffer.from(body.data, "base64").length;
    if (await storageFull(ws, bytes)) return c.json(STORAGE_FULL, 402);
    return c.json({
        item: await storeUpload(ws.id, { ...body, data: body.data, mime: body.mime }),
    });
});

media.post("/media/use", requireWorkspace, async (c) => {
    const { item } = await readJson<{ item?: MediaItem }>(c);
    if (!item?.url) return c.json({ error: "item required" }, 400);
    await useItem(c.get("ws").id, item);
    return c.json({ item });
});

media.get("/media/recent", requireWorkspace, async (c) =>
    c.json({ items: await recentAssets(c.get("ws").id) }),
);

// Public by opaque uuid so <img>/canvas/export load credential-less, like a stock CDN url.
media.get("/media/asset/:id", async (c) => {
    const a = await readAssetBytes(c.req.param("id"));
    if (!a) return c.text("not found", 404);
    return c.body(Buffer.from(a.data, "base64"), 200, {
        "content-type": a.mime ?? "image/png",
        "cache-control": "public, max-age=31536000, immutable",
    });
});
