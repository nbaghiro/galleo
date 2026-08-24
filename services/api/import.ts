import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { BAD_BODY, rateLimit, readJson } from "@services/utils/http";
import { fetchSlidesPptx, importPptx, ImportError } from "@services/core/import";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";

// File → artifact content. The server parses and stores the pictures; the client persists the
// returned content through the ordinary create route, so import shares its validation and caps.

export const importer = new Hono<WorkspaceEnv>();

const importLimiter = rateLimit({ name: "import", limit: 10, windowMs: 60_000 });
// base64 of the 40 MB deck cap, plus JSON envelope headroom
const importBody = bodyLimit({ maxSize: 64 * 1024 * 1024 });

const zImportFile = z.object({ name: z.string().optional(), data: z.string() });
const zImportSlides = z.object({ url: z.string() });

const STORAGE_FULL = { error: "storage limit reached", reason: "storage", upgrade: true } as const;

function fail(c: Context<WorkspaceEnv>, e: unknown): Response {
    if (e instanceof ImportError)
        return e.status === 402
            ? c.json(STORAGE_FULL, 402)
            : c.json({ error: e.message }, e.status);
    throw e;
}

importer.post("/import/pptx", requireWorkspace, importLimiter, importBody, async (c) => {
    const body = await readJson(c, zImportFile);
    if (!body?.data) return c.json(BAD_BODY, 400);
    try {
        const out = await importPptx(c.get("ws"), {
            data: new Uint8Array(Buffer.from(body.data, "base64")),
            ...(body.name ? { name: body.name } : {}),
        });
        return c.json(out);
    } catch (e) {
        return fail(c, e);
    }
});

importer.post("/import/slides", requireWorkspace, importLimiter, async (c) => {
    const body = await readJson(c, zImportSlides);
    const url = body?.url?.trim();
    if (!url) return c.json({ error: "a url is required" }, 400);
    try {
        const file = await fetchSlidesPptx(url);
        const out = await importPptx(c.get("ws"), file);
        return c.json(out);
    } catch (e) {
        return fail(c, e);
    }
});
