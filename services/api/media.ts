import { Hono } from "hono";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { and, desc, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type {
    MediaAttribution,
    MediaGenStyle,
    MediaItem,
    MediaKind,
    MediaProvider,
    MediaSource,
} from "@model/media";
import { estimateCost } from "@model/tools";
import { limitsFor } from "@model/billing";
import { db, schema } from "../schema";
import { SESSION_COOKIE } from "../auth";
import { currentUser, currentWorkspace, firstWorkspaceId, readJson } from "./context";
import { fireDownloadTrigger, searchStock, stockReady } from "../media/providers";
import { streamImages, imageGenReady } from "../media/generate";
import { getIcon, searchIcons } from "../media/icons";

// Stored media lives in the assets table; stock stays a provider CDN url; all sources normalize to MediaItem.
export const media = new Hono();

const RECENT_LIMIT = 48;
const assetUrl = (id: string): string => `/api/media/asset/${id}`;

interface AssetMeta {
    attribution?: MediaAttribution;
    prompt?: string;
    thumbUrl?: string;
}

// Returns the workspace id, or an error Response the caller returns as-is.
async function requireWs(c: Context): Promise<string | Response> {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    return ws;
}

type AssetRow = typeof schema.assets.$inferSelect;
function toItem(row: AssetRow): MediaItem {
    const meta = (row.meta ?? {}) as AssetMeta;
    return {
        id: row.id,
        source: row.source as MediaSource,
        url: row.url,
        thumbUrl: meta.thumbUrl ?? row.url,
        width: row.width ?? 0,
        height: row.height ?? 0,
        alt: row.alt ?? undefined,
        prompt: meta.prompt,
        attribution: meta.attribution,
    };
}

media.get("/media/providers", async (c) => {
    const ws = await requireWs(c);
    if (typeof ws !== "string") return ws;
    return c.json({ stock: stockReady(), generate: imageGenReady() });
});

media.get("/media/search", async (c) => {
    const ws = await requireWs(c);
    if (typeof ws !== "string") return ws;
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

media.get("/media/icons", async (c) => {
    const ws = await requireWs(c);
    if (typeof ws !== "string") return ws;
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ icons: [], total: 0 });
    try {
        const { icons, total } = await searchIcons(q, Number(c.req.query("limit")) || 60);
        return c.json({ icons, total });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "icon search failed" }, 502);
    }
});

media.get("/media/icon", async (c) => {
    const ws = await requireWs(c);
    if (typeof ws !== "string") return ws;
    const id = (c.req.query("id") ?? "").trim();
    if (!id) return c.json({ error: "id required" }, 400);
    try {
        const icon = await getIcon(id);
        if (!icon) return c.json({ error: "not found" }, 404);
        return c.json({ icon });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "icon fetch failed" }, 502);
    }
});

// Metered per image: reserve the requested count up front, reconcile down to what came back so failed variations aren't charged.
media.post("/media/generate", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!imageGenReady()) return c.json({ error: "image generation not configured" }, 503);
    const { prompt, aspect, n, style } = await readJson<{
        prompt?: string;
        aspect?: string;
        n?: number;
        style?: MediaGenStyle;
    }>(c);
    if (!prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);
    const p = prompt.trim();

    const want = Math.max(1, Math.min(4, n ?? 4));
    const reserve = estimateCost("generate-image", { variations: want });
    const limit = limitsFor(ws.plan).aiCreditsPerMonth;
    if (ws.aiCreditsUsed + reserve > limit)
        return c.json(
            {
                error: "out of AI credits",
                upgrade: true,
                remaining: Math.max(0, limit - ws.aiCreditsUsed),
            },
            402,
        );
    await db
        .update(schema.workspaces)
        .set({ aiCreditsUsed: ws.aiCreditsUsed + reserve })
        .where(eq(schema.workspaces.id, ws.id));

    return streamSSE(c, async (stream) => {
        const send = (data: unknown): Promise<void> =>
            stream.writeSSE({ data: JSON.stringify(data) });
        let produced = 0;
        try {
            for await (const img of streamImages(p, aspect, want, style ?? "photo")) {
                if (!img) {
                    await send({ type: "fail" });
                    continue;
                }
                const id = crypto.randomUUID();
                const meta: AssetMeta = { prompt: p };
                await db.insert(schema.assets).values({
                    id,
                    workspaceId: ws.id,
                    kind: "image",
                    source: "generated",
                    url: assetUrl(id),
                    width: img.width,
                    height: img.height,
                    bytes: Buffer.from(img.dataBase64, "base64").length,
                    alt: p.slice(0, 160),
                    meta,
                    data: img.dataBase64,
                    mime: img.mime,
                });
                produced++;
                const item: MediaItem = {
                    id,
                    source: "generated",
                    url: assetUrl(id),
                    thumbUrl: assetUrl(id),
                    width: img.width,
                    height: img.height,
                    alt: p.slice(0, 160),
                    prompt: p,
                };
                await send({ type: "image", item });
            }
        } finally {
            // Reconcile the reserve down to what was produced (refund the shortfall).
            const finalUsed = produced
                ? ws.aiCreditsUsed + estimateCost("generate-image", { variations: produced })
                : ws.aiCreditsUsed;
            if (finalUsed !== ws.aiCreditsUsed + reserve)
                await db
                    .update(schema.workspaces)
                    .set({ aiCreditsUsed: finalUsed })
                    .where(eq(schema.workspaces.id, ws.id));
            await send({ type: "done", produced });
        }
    });
});

media.post("/media/upload", async (c) => {
    const ws = await requireWs(c);
    if (typeof ws !== "string") return ws;
    const body = await readJson<{
        data?: string;
        mime?: string;
        name?: string;
        width?: number;
        height?: number;
    }>(c);
    if (!body.data || !body.mime) return c.json({ error: "data and mime are required" }, 400);
    const id = crypto.randomUUID();
    await db.insert(schema.assets).values({
        id,
        workspaceId: ws,
        kind: "image",
        source: "upload",
        url: assetUrl(id),
        width: body.width ?? null,
        height: body.height ?? null,
        bytes: Buffer.from(body.data, "base64").length,
        alt: body.name ?? null,
        meta: {},
        data: body.data,
        mime: body.mime,
    });
    return c.json({
        item: {
            id,
            source: "upload",
            url: assetUrl(id),
            thumbUrl: assetUrl(id),
            width: body.width ?? 0,
            height: body.height ?? 0,
            alt: body.name,
        } satisfies MediaItem,
    });
});

// Stored-media url pattern — recognise to bump recency on re-use.
const STORED_URL = /\/media\/asset\/([0-9a-f-]{36})$/i;

// Stored media just bumps recency; stock logs the CDN url + fires the Unsplash download trigger (their API terms).
media.post("/media/use", async (c) => {
    const ws = await requireWs(c);
    if (typeof ws !== "string") return ws;
    const { item } = await readJson<{ item?: MediaItem }>(c);
    if (!item?.url) return c.json({ error: "item required" }, 400);
    const storedId = STORED_URL.exec(item.url)?.[1];
    if (storedId) {
        // Already in the library — bump to the top of Recent (mirrors the stock dedup below).
        await db
            .update(schema.assets)
            .set({ createdAt: new Date() })
            .where(and(eq(schema.assets.workspaceId, ws), eq(schema.assets.id, storedId)));
    } else if (item.source === "stock") {
        void fireDownloadTrigger(item.attribution?.downloadLocation);
        // Dedupe: a re-used photo moves to the top rather than stacking duplicates.
        await db
            .delete(schema.assets)
            .where(and(eq(schema.assets.workspaceId, ws), eq(schema.assets.url, item.url)));
        const meta: AssetMeta = { attribution: item.attribution, thumbUrl: item.thumbUrl };
        await db.insert(schema.assets).values({
            id: crypto.randomUUID(),
            workspaceId: ws,
            kind: "image",
            source: "stock",
            url: item.url,
            width: item.width || null,
            height: item.height || null,
            bytes: null,
            alt: item.alt ?? null,
            meta,
            data: null,
            mime: null,
        });
    }
    return c.json({ item });
});

media.get("/media/recent", async (c) => {
    const ws = await requireWs(c);
    if (typeof ws !== "string") return ws;
    const rows = await db
        .select()
        .from(schema.assets)
        .where(eq(schema.assets.workspaceId, ws))
        .orderBy(desc(schema.assets.createdAt))
        .limit(RECENT_LIMIT);
    return c.json({ items: rows.map(toItem) });
});

// Public by opaque uuid so <img>/canvas/export load credential-less, like a stock CDN url.
media.get("/media/asset/:id", async (c) => {
    const [a] = await db
        .select({ data: schema.assets.data, mime: schema.assets.mime })
        .from(schema.assets)
        .where(eq(schema.assets.id, c.req.param("id")));
    if (!a?.data) return c.text("not found", 404);
    return c.body(Buffer.from(a.data, "base64"), 200, {
        "content-type": a.mime ?? "image/png",
        "cache-control": "public, max-age=31536000, immutable",
    });
});
