import { Hono } from "hono";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";
import { rateLimit, readJson } from "../utils/http";
import { fetchWebpage } from "../utils/webpage";
import { embeddingReady } from "../core/ai/provider";
import {
    addArtifactItem,
    addLinkItem,
    addTemplateItem,
    addTextItem,
    createContext,
    deleteContext,
    getContextItems,
    getItemBody,
    listContexts,
    removeItem,
    resyncItem,
    updateContext,
} from "../core/context";

// The context library: workspace-scoped CRUD + per-kind ingestion. Ingestion is unpriced to the
// user (a context is an investment we want made); the embedding spend is ours and marginal.

export const context = new Hono<WorkspaceEnv>();

const gate = (ready: boolean): string | null =>
    ready ? null : "contexts need the embedding model, which isn't configured on this server";

// One-off page snapshot for the intake's attachments: same SSRF-vetted fetch the context library
// uses, but the text rides in the brief's source material instead of the vector store.
const webpageLimiter = rateLimit({ name: "webpage", limit: 20, windowMs: 60_000 });
const PAGE_CAP = 200_000;

context.post("/webpage", requireWorkspace, webpageLimiter, async (c) => {
    const body = await readJson<{ url?: string }>(c);
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

context.get("/contexts", requireWorkspace, async (c) => {
    const contexts = await listContexts(c.get("ws").id);
    return c.json({ contexts });
});

context.post("/contexts", requireWorkspace, async (c) => {
    const body = await readJson<{ name?: string; description?: string }>(c);
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
    const body = await readJson<{ name?: string; description?: string | null }>(c);
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

interface NewItemBody {
    kind?: "file" | "text" | "link" | "artifact" | "template";
    title?: string;
    body?: string;
    url?: string;
    artifactId?: string;
    templateId?: string;
}

context.post("/contexts/:id/items", requireWorkspace, async (c) => {
    const blocked = gate(embeddingReady());
    if (blocked) return c.json({ error: blocked }, 503);
    const ws = c.get("ws");
    const user = c.get("user");
    const contextId = c.req.param("id");
    const body = await readJson<NewItemBody>(c);
    if (!body?.kind) return c.json({ error: "an item kind is required" }, 400);
    try {
        if (body.kind === "file" || body.kind === "text") {
            if (!body.body?.trim()) return c.json({ error: "there was no text to add" }, 400);
            const item = await addTextItem(
                ws.id,
                contextId,
                user.id,
                body.kind,
                body.title ?? (body.kind === "file" ? "Uploaded file" : "Pasted text"),
                body.body,
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
        return c.json({ error: e instanceof Error ? e.message : "couldn't add that" }, 400);
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
