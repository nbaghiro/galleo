import { Hono } from "hono";
import type { Context } from "hono";
import type { ArtifactContent, ArtifactPage, GenMeta } from "@model/artifact";
import { featuresFor, isUnlimited, limit } from "@model/billing";
import { TEMPLATE_INDEX } from "@model/templates";
import { z } from "zod";
import { BAD_BODY, checkLimit, readJson } from "@services/utils/http";
import { currentWorkspace, type WorkspaceRow } from "@services/core/accounts";
import { recordArtifactVisit, recordTemplateUse } from "@services/core/visits";
import {
    applyContentOps,
    createArtifact,
    decodeCursor,
    deleteArtifact,
    emptyTrash,
    isArtifactContent,
    isSectionOp,
    listArtifacts,
    liveArtifactCount,
    pageLimit,
    parseWindow,
    readAiMeta,
    readArtifact,
    readSections,
    setTrashed,
    updateArtifact,
    windowOf,
} from "@services/core/artifacts";
import { requireUser, requireWorkspace, type WorkspaceEnv } from "./middleware";

export const artifacts = new Hono<WorkspaceEnv>();

const LIST_LIMIT = 24;
const LIST_MAX = 100;

// A user with no workspace yet sees an empty library, not an error.
artifacts.get("/artifacts", requireUser, async (c) => {
    const ws = await currentWorkspace(c.get("user").id);
    if (!ws) return c.json({ artifacts: [], nextCursor: null } satisfies ArtifactPage);
    return c.json(
        await listArtifacts(ws.id, {
            trashed: c.req.query("trashed") === "1",
            alpha: c.req.query("sort") === "az",
            folder: c.req.query("folder"),
            format: c.req.query("format"),
            take: pageLimit(c.req.query("limit"), LIST_LIMIT, LIST_MAX),
            cursor: decodeCursor(c.req.query("cursor")),
        }),
    );
});

/**
 * The artifact cap, applied wherever a live artifact appears rather than only where one is inserted:
 * restoring from Trash raises the live count just as creating does, and without this a workspace at
 * the cap could trash one, create one, and restore the first. Counting is skipped on an unlimited
 * plan so the common path does not pay for a COUNT.
 */
async function overArtifactCap(
    c: Context<WorkspaceEnv>,
    ws: WorkspaceRow,
): Promise<Response | null> {
    if (isUnlimited(limit(featuresFor(ws), "maxArtifacts"))) return null;
    return checkLimit(
        c,
        ws,
        "maxArtifacts",
        await liveArtifactCount(ws.id),
        (cap) => `Your plan is limited to ${cap} artifacts — upgrade for unlimited.`,
    );
}

// z.custom validates without rebuilding, so stored content and provenance keep every field they
// arrived with; a z.object here would strip whatever this file does not enumerate.
const zContent = z.custom<ArtifactContent>(isArtifactContent);
// nothing reads aiMeta back at render time, so the shape check stops at "is an object"
const zGenMeta = z.custom<GenMeta>((v) => !!v && typeof v === "object");

const zArtifactInput = z.object({
    title: z.string().optional(),
    themeId: z.string().optional(),
    formatId: z.string().optional(),
    draftContent: zContent.optional(),
    folderId: z.string().nullish(),
    aiMeta: zGenMeta.optional(),
    templateId: z.string().optional(),
});

const zContentPatch = z.object({
    ops: z.array(z.unknown()).optional(),
    themeId: z.string().optional(),
    formatId: z.string().optional(),
});

artifacts.post("/artifacts", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    const denied = await overArtifactCap(c, ws);
    if (denied) return denied;
    const body = await readJson(c, zArtifactInput);
    if (!body) return c.json(BAD_BODY, 400);
    const id = await createArtifact(ws.id, c.get("user").id, body);
    // popularity is measured from these events; never let the tally break a create
    if (id && body?.templateId && TEMPLATE_INDEX.some((t) => t.id === body.templateId))
        await recordTemplateUse(c.get("user").id, body.templateId).catch(() => undefined);
    return id ? c.json({ id }) : c.json({ error: "create failed" }, 500);
});

artifacts.get("/artifacts/:id", requireWorkspace, async (c) => {
    const a = await readArtifact(c.get("ws").id, c.req.param("id"));
    if (!a) return c.json({ error: "not found" }, 404);
    const win = parseWindow(c.req.query("window"));
    if (win) return c.json({ artifact: windowOf(a, win) });
    return c.json({
        artifact: {
            id: a.id,
            title: a.title,
            themeId: a.themeId,
            formatId: a.formatId,
            draftContent: a.draftContent,
            updatedAt: a.updatedAt,
        },
    });
});

artifacts.get("/artifacts/:id/ai-meta", requireWorkspace, async (c) => {
    const meta = await readAiMeta(c.get("ws").id, c.req.param("id"));
    return meta === undefined ? c.json({ error: "not found" }, 404) : c.json({ meta });
});

artifacts.get("/artifacts/:id/sections", requireWorkspace, async (c) => {
    const all = await readSections(c.get("ws").id, c.req.param("id"));
    if (!all) return c.json({ error: "not found" }, 404);
    const ids = c.req.query("ids");
    if (ids) {
        const want = new Set(ids.split(",").filter(Boolean).slice(0, 200));
        return c.json({ sections: all.filter((s) => want.has(s.id)) });
    }
    const win = parseWindow(c.req.query("window")) ?? { from: 0, count: 24 };
    return c.json({ sections: all.slice(win.from, win.from + win.count) });
});

artifacts.post("/artifacts/:id/visit", requireWorkspace, async (c) => {
    const ok = await recordArtifactVisit(c.get("ws").id, c.req.param("id"), c.get("user").id);
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

artifacts.post("/artifacts/:id/trash", requireWorkspace, async (c) => {
    await setTrashed(c.get("ws").id, c.req.param("id"), new Date());
    return c.json({ ok: true });
});

artifacts.post("/artifacts/:id/restore", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    const denied = await overArtifactCap(c, ws);
    if (denied) return denied;
    await setTrashed(ws.id, c.req.param("id"), null);
    return c.json({ ok: true });
});

artifacts.delete("/artifacts/:id", requireWorkspace, async (c) => {
    await deleteArtifact(c.get("ws").id, c.req.param("id"));
    return c.json({ ok: true });
});

artifacts.delete("/trash", requireWorkspace, async (c) => {
    await emptyTrash(c.get("ws").id);
    return c.json({ ok: true });
});

artifacts.patch("/artifacts/:id/content", requireWorkspace, async (c) => {
    const body = await readJson(c, zContentPatch);
    if (!body) return c.json(BAD_BODY, 400);
    const ops = (body.ops ?? []).filter(isSectionOp);
    if (!ops.length) return c.json({ error: "no ops" }, 400);
    const result = await applyContentOps(c.get("ws").id, c.req.param("id"), ops, {
        themeId: body.themeId,
        formatId: body.formatId,
    });
    if (result.status !== 200) return c.json({ error: result.error }, result.status);
    return c.json({ ok: true, updatedAt: result.updatedAt, total: result.total });
});

artifacts.patch("/artifacts/:id", requireWorkspace, async (c) => {
    const body = await readJson(c, zArtifactInput);
    if (!body) return c.json(BAD_BODY, 400);
    const a = await updateArtifact(c.get("ws").id, c.req.param("id"), body);
    return a ? c.json({ ok: true, updatedAt: a.updatedAt }) : c.json({ error: "not found" }, 404);
});
