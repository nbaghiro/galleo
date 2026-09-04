import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";
import { z } from "zod";
import { creditRefusal, rateLimit, readJson } from "@services/utils/http";
import { fetchWebpage } from "@services/utils/webpage";
import { embeddingReady } from "@services/core/ai/provider";
import { ExtractError, extractUpload, type ImageReader } from "@services/core/extract";
import { runTool } from "@services/core/ai/execute";
import {
    addArtifactItem,
    addLinkItem,
    addTemplateItem,
    addTextItem,
    createContext,
    deleteContext,
    getContextItems,
    getItemBody,
    getItemOriginal,
    listContexts,
    removeItem,
    resyncItem,
    updateContext,
} from "@services/core/context";

// The context library: workspace-scoped CRUD + per-kind ingestion. Ingestion is unpriced to the
// user (a context is an investment we want made); the embedding spend is ours and marginal. Reading
// a file is the exception: a vision pass over a scanned document is a model call like any other, and
// is held and billed as one.

export const context = new Hono<WorkspaceEnv>();

const gate = (ready: boolean): string | null =>
    ready ? null : "contexts need the embedding model, which isn't configured on this server";

// One-off page snapshot for the intake's attachments: same SSRF-vetted fetch the context library
// uses, but the text rides in the brief's source material instead of the vector store.
const webpageLimiter = rateLimit({ name: "webpage", limit: 20, windowMs: 60_000 });
const PAGE_CAP = 200_000;

const zWebpage = z.object({ url: z.string().optional() });
const zExtract = z.object({
    name: z.string().optional(),
    mime: z.string().optional(),
    data: z.string().optional(),
});
const zNewContext = z.object({ name: z.string().optional(), description: z.string().optional() });
const zContextPatch = z.object({
    name: z.string().optional(),
    description: z.string().nullish(),
});
const zNewItem = z.object({
    kind: z.enum(["file", "text", "link", "artifact", "template"]).optional(),
    title: z.string().optional(),
    body: z.string().optional(),
    url: z.string().optional(),
    artifactId: z.string().optional(),
    templateId: z.string().optional(),
    original: z.object({ data: z.string().optional(), mime: z.string().optional() }).optional(),
});

context.post("/webpage", requireWorkspace, webpageLimiter, async (c) => {
    const body = await readJson(c, zWebpage);
    if (!body?.url?.trim()) return c.json({ error: "a url is required" }, 400);
    try {
        const page = await fetchWebpage(body.url);
        return c.json({
            title: page.title,
            text: page.text.slice(0, PAGE_CAP),
            url: page.finalUrl,
        });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "couldn't fetch that page" }, 400);
    }
});

// Files that need server-side reading (pdf/docx/xlsx/images): the client sends bytes, gets back
// text, then attaches it exactly like a webpage snapshot. Both upload surfaces share this.
const extractLimiter = rateLimit({ name: "extract", limit: 20, windowMs: 60_000 });
// base64 of the 15 MB document cap, plus JSON envelope headroom
const extractBody = bodyLimit({ maxSize: 32 * 1024 * 1024 });

context.post("/extract", requireWorkspace, extractLimiter, extractBody, async (c) => {
    const ws = c.get("ws");
    const body = await readJson(c, zExtract);
    if (!body?.name || !body.data) return c.json({ error: "a file is required" }, 400);
    // The hold sits around the model read rather than the route: a text layer, a docx or a
    // spreadsheet is parsed locally and must stay free, and only extractUpload knows which branch a
    // file takes. Wrapping the reader also puts a meter in scope, without which the vision call's
    // tokens were not merely unbilled but unrecorded.
    let refused: { remaining: number; capped?: number } | null = null;
    const metered: ImageReader = async (file) => {
        const out = await runTool<string>(
            { id: "read-file", surface: "direct", input: { mime: file.mime, data: file.data } },
            { userId: c.get("user").id, ws, role: c.get("role") },
            { ctx: { image: {} } },
        );
        if (!out.ok) {
            if (out.reason === "credits") refused = out;
            throw new ExtractError("reading this file needs credits", 400);
        }
        return out.result;
    };
    try {
        const out = await extractUpload(
            { name: body.name, mime: body.mime ?? "", data: body.data },
            metered,
        );
        return c.json(out);
    } catch (e) {
        if (refused) return c.json(creditRefusal(ws, refused), 402);
        if (e instanceof ExtractError) return c.json({ error: e.message }, e.status);
        throw e;
    }
});

context.get("/contexts", requireWorkspace, async (c) => {
    const contexts = await listContexts(c.get("ws").id);
    return c.json({ contexts });
});

context.post("/contexts", requireWorkspace, async (c) => {
    const body = await readJson(c, zNewContext);
    const name = body?.name?.trim();
    if (!name) return c.json({ error: "a name is required" }, 400);
    const { id } = await createContext(
        c.get("ws").id,
        c.get("user").id,
        name.slice(0, 120),
        body?.description?.trim() || undefined,
    );
    return c.json({ id });
});

context.get("/contexts/:id", requireWorkspace, async (c) => {
    try {
        const items = await getContextItems(c.get("ws").id, c.req.param("id"));
        return c.json({ items });
    } catch {
        return c.json({ error: "no such context" }, 404);
    }
});

context.patch("/contexts/:id", requireWorkspace, async (c) => {
    const body = await readJson(c, zContextPatch);
    if (!body || (body.name === undefined && body.description === undefined))
        return c.json({ error: "nothing to change" }, 400);
    try {
        await updateContext(c.get("ws").id, c.req.param("id"), body);
        return c.json({ ok: true });
    } catch {
        return c.json({ error: "no such context" }, 404);
    }
});

context.delete("/contexts/:id", requireWorkspace, async (c) => {
    try {
        await deleteContext(c.get("ws").id, c.req.param("id"));
        return c.json({ ok: true });
    } catch {
        return c.json({ error: "no such context" }, 404);
    }
});

context.post("/contexts/:id/items", requireWorkspace, extractBody, async (c) => {
    const blocked = gate(embeddingReady());
    if (blocked) return c.json({ error: blocked }, 503);
    const ws = c.get("ws");
    const user = c.get("user");
    const contextId = c.req.param("id");
    const body = await readJson(c, zNewItem);
    if (!body?.kind) return c.json({ error: "an item kind is required" }, 400);
    try {
        if (body.kind === "file" || body.kind === "text") {
            if (!body.body?.trim()) return c.json({ error: "there was no text to add" }, 400);
            const original =
                body.kind === "file" && body.original?.data && body.original.mime
                    ? { data: body.original.data, mime: body.original.mime }
                    : undefined;
            const item = await addTextItem(
                ws.id,
                contextId,
                user.id,
                body.kind,
                body.title ?? (body.kind === "file" ? "Uploaded file" : "Pasted text"),
                body.body,
                undefined,
                original,
            );
            return c.json({ item });
        }
        if (body.kind === "link") {
            if (!body.url?.trim()) return c.json({ error: "a url is required" }, 400);
            const item = await addLinkItem(ws.id, contextId, user.id, body.url);
            return c.json({ item });
        }
        if (body.kind === "artifact") {
            if (!body.artifactId) return c.json({ error: "an artifact id is required" }, 400);
            const item = await addArtifactItem(ws.id, contextId, user.id, body.artifactId);
            return c.json({ item });
        }
        if (body.kind === "template") {
            if (!body.templateId) return c.json({ error: "a template id is required" }, 400);
            const item = await addTemplateItem(ws.id, contextId, user.id, body.templateId);
            return c.json({ item });
        }
        return c.json({ error: "unknown item kind" }, 400);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        // a missing/foreign context is a 404 here like on every sibling route
        if (msg === "no such context") return c.json({ error: msg }, 404);
        return c.json({ error: msg || "couldn't add that" }, 400);
    }
});

// the stored source file, byte-for-byte — the inspector points a PDF viewer / <img> at this
context.get("/contexts/:id/items/:itemId/original", requireWorkspace, async (c) => {
    try {
        const original = await getItemOriginal(
            c.get("ws").id,
            c.req.param("id"),
            c.req.param("itemId"),
        );
        if (!original) return c.json({ error: "no original stored for this item" }, 404);
        c.header("Content-Type", original.mime);
        c.header("Cache-Control", "private, max-age=3600");
        return c.body(new Uint8Array(Buffer.from(original.data, "base64")));
    } catch {
        return c.json({ error: "no such item" }, 404);
    }
});

context.get("/contexts/:id/items/:itemId/snapshot", requireWorkspace, async (c) => {
    try {
        const body = await getItemBody(c.get("ws").id, c.req.param("id"), c.req.param("itemId"));
        return c.json({ body });
    } catch {
        return c.json({ error: "no such item" }, 404);
    }
});

context.delete("/contexts/:id/items/:itemId", requireWorkspace, async (c) => {
    try {
        await removeItem(c.get("ws").id, c.req.param("id"), c.req.param("itemId"));
        return c.json({ ok: true });
    } catch {
        return c.json({ error: "no such item" }, 404);
    }
});

context.post("/contexts/:id/items/:itemId/resync", requireWorkspace, async (c) => {
    const blocked = gate(embeddingReady());
    if (blocked) return c.json({ error: blocked }, 503);
    try {
        await resyncItem(c.get("ws").id, c.req.param("id"), c.req.param("itemId"));
        return c.json({ ok: true });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "couldn't re-sync that" }, 400);
    }
});
