import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { MediaItem, MediaKind, MediaProvider, MediaSource } from "@model/media";
import { featuresFor } from "@model/billing";
import { z } from "zod";
import { assetUrl } from "@model/media";
import { BAD_BODY, creditRefusal, readJson } from "@services/utils/http";
import { pricesFor, reserve } from "@services/core/spend";
import {
    adoptUrls,
    adoptable,
    assetForBytes,
    deleteAsset,
    embedPoster,
    generateVideo,
    getIcon,
    imageGenReady,
    libraryAssets,
    readAsset,
    refImage,
    searchIcons,
    searchStock,
    stockReady,
    storageFull,
    storeGenerated,
    storeUpload,
    streamImages,
    type GenRef,
    useItem,
    videoGenReady,
} from "@services/core/media";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";

export const media = new Hono<WorkspaceEnv>();

const STORAGE_FULL = { error: "storage limit reached", reason: "storage", upgrade: true } as const;

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

const zGenerate = z.object({
    prompt: z.string().optional(),
    aspect: z.string().optional(),
    n: z.number().optional(),
    style: z.enum(["photo", "illustration", "3d", "line", "watercolor"]).optional(),
    refId: z.string().optional(),
});
const zGenerateVideo = z.object({ prompt: z.string().optional(), aspect: z.string().optional() });
const zUpload = z.object({
    data: z.string().optional(),
    mime: z.string().optional(),
    name: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
});
// an item round-trips back to the picker, so it keeps whatever attribution it arrived with
const zLink = z.object({ url: z.string().optional() });
const SOURCES: MediaSource[] = ["stock", "generated", "upload", "link"];
const zUse = z.object({
    item: z
        .custom<MediaItem>(
            (v) => !!v && typeof v === "object" && typeof (v as MediaItem).url === "string",
        )
        .optional(),
});

// Metered per image: reserved up front, reconciled down so failed variations aren't charged.
media.post("/media/generate", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!imageGenReady()) return c.json({ error: "image generation not configured" }, 503);
    const body = await readJson(c, zGenerate);
    if (!body) return c.json(BAD_BODY, 400);
    const { prompt, aspect, n, style, refId } = body;
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
    // prices, not the defaults: the picture runs on the tier's image model, so a workspace on a
    // dearer one has to be quoted and billed at that model's price rather than the base model's
    const held = await reserve(ws, c.get("user").id, "generate-image", {
        size: { variations: want },
        prices: pricesFor(ws, {}),
        role: c.get("role"),
        surface: "direct",
    });
    if (!held.ok) return c.json(creditRefusal(ws, held), 402);

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
    const body = await readJson(c, zGenerateVideo);
    if (!body) return c.json(BAD_BODY, 400);
    const { prompt, aspect } = body;
    if (!prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);
    const p = prompt.trim();
    const ar = aspect === "9:16" ? "9:16" : "16:9";

    if (await storageFull(ws)) return c.json(STORAGE_FULL, 402);
    const held = await reserve(ws, c.get("user").id, "generate-video", {
        prices: pricesFor(ws, {}),
        role: c.get("role"),
        surface: "direct",
    });
    if (!held.ok) return c.json(creditRefusal(ws, held), 402);

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
    const body = await readJson(c, zUpload);
    if (!body?.data || !body.mime) return c.json({ error: "data and mime are required" }, 400);
    // bytes we already hold cost nothing to pick again, so the cap must not reject them
    const held = await assetForBytes(ws.id, body.data);
    if (!held) {
        const bytes = Buffer.from(body.data, "base64").length;
        if (await storageFull(ws, bytes)) return c.json(STORAGE_FULL, 402);
    }
    return c.json({
        item: await storeUpload(ws.id, { ...body, data: body.data, mime: body.mime }),
    });
});

// Returns the canonical item, which is what the picker commits into the artifact.
media.post("/media/use", requireWorkspace, async (c) => {
    const body = await readJson(c, zUse);
    const item = body?.item;
    if (!item?.url) return c.json({ error: "item required" }, 400);
    return c.json({ item: await useItem(c.get("ws").id, item) });
});

// The workspace library. Complete by construction: every picture in every artifact was adopted on
// the way in, so this needs no scan and no filtering.
media.get("/media/library", requireWorkspace, async (c) => {
    const kindQ = c.req.query("kind");
    const sourcesQ = (c.req.query("sources") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is MediaSource => SOURCES.includes(s as MediaSource));
    const beforeQ = c.req.query("before");
    const q = c.req.query("q") ?? undefined;
    const before = beforeQ ? new Date(beforeQ) : undefined;
    return c.json(
        await libraryAssets(c.get("ws").id, {
            kind: kindQ === "video" ? "video" : kindQ === "image" ? "image" : undefined,
            sources: sourcesQ.length ? sourcesQ : undefined,
            q,
            before: before && !Number.isNaN(before.getTime()) ? before : undefined,
            limit: Number(c.req.query("limit")) || undefined,
        }),
    );
});

// Adopts a url the user typed. The picker and the inspector both hand back the canonical url, so
// content never carries a foreign one.
media.post("/media/link", requireWorkspace, async (c) => {
    const body = await readJson(c, zLink);
    const url = body?.url?.trim();
    if (!url) return c.json({ error: "url required" }, 400);
    // a url we cannot adopt (a platform video page, or something already ours) passes through
    const id = adoptable(url) ? (await adoptUrls(c.get("ws").id, [url])).get(url) : undefined;
    if (id) return c.json({ url: assetUrl(id) });
    // a platform video keeps its link, but its still is adopted: every surface that paints rather
    // than plays needs one, and only Vimeo makes us ask for it
    const poster = await embedPoster(url);
    const posterId = poster ? (await adoptUrls(c.get("ws").id, [poster])).get(poster) : undefined;
    return c.json({ url, ...(posterId ? { poster: assetUrl(posterId) } : {}) });
});

// Refusing to delete something a deck still shows beats leaving a hole in it, so the artifacts
// using it come back instead of a bare error.
media.delete("/media/asset/:id", requireWorkspace, async (c) => {
    const res = await deleteAsset(c.get("ws").id, c.req.param("id"));
    if (res.ok) return c.json({ ok: true });
    const [first, ...rest] = res.usedBy;
    return c.json(
        {
            error: rest.length
                ? `Still used in ${res.usedBy.length} artifacts, including ${first!.title}`
                : `Still used in ${first!.title}`,
            usedBy: res.usedBy,
        },
        409,
    );
});

// Public by opaque uuid so <img>/canvas/export load credential-less, like a stock CDN url. A row we
// hold bytes for serves them; an adopted one redirects to where they still live, which is what lets
// content reference every picture the same way whoever it came from.
media.get("/media/asset/:id", async (c) => {
    const a = await readAsset(c.req.param("id"));
    if (!a) return c.text("not found", 404);
    if (!a.data) {
        return a.origin ? c.redirect(a.origin, 302) : c.text("not found", 404);
    }
    const bytes = Buffer.from(a.data, "base64");
    const type = a.mime ?? "image/png";
    const cache = "public, max-age=31536000, immutable";
    // Seeking is a range request, and a player that cannot make one has to refetch from byte zero to
    // scrub. Advertising the support is half of it: Safari will not start some media without it.
    const range = parseRange(c.req.header("range"), bytes.length);
    if (range === "unsatisfiable")
        return c.body(null, 416, { "content-range": `bytes */${bytes.length}` });
    if (range)
        return c.body(bytes.subarray(range.start, range.end + 1), 206, {
            "content-type": type,
            "cache-control": cache,
            "accept-ranges": "bytes",
            "content-range": `bytes ${range.start}-${range.end}/${bytes.length}`,
        });
    return c.body(bytes, 200, {
        "content-type": type,
        "cache-control": cache,
        "accept-ranges": "bytes",
    });
});

// Only the single-range form, which is what a media element asks for; a multipart range is legal
// but no player sends one, and answering the whole body is a valid response to anything else.
function parseRange(
    header: string | undefined,
    size: number,
): { start: number; end: number } | "unsatisfiable" | null {
    const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
    if (!m || (!m[1] && !m[2])) return null;
    const [start, end] = m[1]
        ? [Number(m[1]), m[2] ? Math.min(Number(m[2]), size - 1) : size - 1]
        : [Math.max(0, size - Number(m[2])), size - 1]; // a suffix range: the last N bytes
    return start > end || start >= size ? "unsatisfiable" : { start, end };
}
