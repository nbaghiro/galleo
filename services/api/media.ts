import { Hono } from "hono";
import type { Context } from "hono";
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
import { db, schema } from "../schema";
import { SESSION_COOKIE } from "../auth";
import { currentUser, firstWorkspaceId, readJson } from "./context";
import { fireDownloadTrigger, searchStock, stockReady } from "../media/providers";
import { generateImages, imageGenReady } from "../media/generate";
import { getIcon, searchIcons } from "../media/icons";

// The media picker's backend: stock search (Unsplash / Pexels / Pixabay), AI generation, upload, a
// recent-library, and a public asset-serve route for stored (generated / uploaded) bytes. Stored media
// lives in the `assets` table; stock stays a provider CDN url. Every source normalizes to MediaItem.
export const media = new Hono();

const RECENT_LIMIT = 48;
const assetUrl = (id: string): string => `/api/media/asset/${id}`;

// Metadata we keep in assets.meta (attribution for stock, prompt for generated, thumb for the grid).
interface AssetMeta {
    attribution?: MediaAttribution;
    prompt?: string;
    thumbUrl?: string;
}

// Auth guard: the workspace id, or an error Response the caller returns as-is.
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

// GET /media/providers — which sources are configured, so the rail can badge "needs a key".
media.get("/media/providers", async (c) => {
    const ws = await requireWs(c);
    if (typeof ws !== "string") return ws;
    return c.json({ stock: stockReady(), generate: imageGenReady() });
});

// GET /media/search?provider&q&orientation&page — one stock provider, normalized.
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

// GET /media/icons?q&limit — keyless Iconify search, returns ids for the picker grid.
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

// GET /media/icon?id — the picked icon's SVG body (currentColor-based), fetched on pick.
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

// POST /media/generate { prompt, aspect, n } — AI images, stored as assets, returned as MediaItems.
media.post("/media/generate", async (c) => {
    const ws = await requireWs(c);
    if (typeof ws !== "string") return ws;
    if (!imageGenReady()) return c.json({ error: "image generation not configured" }, 503);
    const { prompt, aspect, n, style } = await readJson<{
        prompt?: string;
        aspect?: string;
        n?: number;
        style?: MediaGenStyle;
    }>(c);
    if (!prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);
    let images;
    try {
        images = await generateImages(prompt.trim(), aspect, n ?? 4, style ?? "photo");
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "generation failed" }, 502);
    }
    if (images.length === 0) return c.json({ error: "the model returned no image" }, 502);
    const items: MediaItem[] = [];
    for (const img of images) {
        const id = crypto.randomUUID();
        const meta: AssetMeta = { prompt: prompt.trim() };
        await db.insert(schema.assets).values({
            id,
            workspaceId: ws,
            kind: "image",
            source: "generated",
            url: assetUrl(id),
            width: img.width,
            height: img.height,
            bytes: Buffer.from(img.dataBase64, "base64").length,
            alt: prompt.trim().slice(0, 160),
            meta,
            data: img.dataBase64,
            mime: img.mime,
        });
        items.push({
            id,
            source: "generated",
            url: assetUrl(id),
            thumbUrl: assetUrl(id),
            width: img.width,
            height: img.height,
            alt: prompt.trim().slice(0, 160),
            prompt: prompt.trim(),
        });
    }
    return c.json({ items });
});

// POST /media/upload { data(base64), mime, name, width, height } — store a user file.
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

// Stored (generated / uploaded) media serves from /api/media/asset/:id — recognise it to bump on re-use.
const STORED_URL = /\/media\/asset\/([0-9a-f-]{36})$/i;

// POST /media/use { item } — record a pick in the recent library, surfacing it at the top. Stored media
// (generated / uploaded) is already saved, so a pick just bumps its recency; stock also logs the CDN url +
// fires the Unsplash download trigger (their API terms). Either way Recent reflects most-recent activity.
media.post("/media/use", async (c) => {
    const ws = await requireWs(c);
    if (typeof ws !== "string") return ws;
    const { item } = await readJson<{ item?: MediaItem }>(c);
    if (!item?.url) return c.json({ error: "item required" }, 400);
    const storedId = STORED_URL.exec(item.url)?.[1];
    if (storedId) {
        // Already in the library — move it back to the top of Recent (mirrors the stock dedup below).
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

// GET /media/recent — the workspace's recently used / created images, newest first.
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

// GET /media/asset/:id — serve stored bytes. Public by opaque uuid so <img>/canvas/export load uniformly
// (cross-origin, credential-less) the same as a stock CDN url.
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
