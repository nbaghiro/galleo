import { Hono } from "hono";
import type { ArtifactInput, ArtifactPage, ContentPatch } from "@model/artifact";
import { featuresFor, isUnlimited, limit } from "@model/billing";
import { readJson } from "../utils/http";
import { currentWorkspace } from "../core/accounts";
import {
    applyContentOps,
    createArtifact,
    decodeCursor,
    deleteArtifact,
    emptyTrash,
    isSectionOp,
    listArtifacts,
    liveArtifactCount,
    pageLimit,
    parseWindow,
    readAiMeta,
    readArtifact,
    readSections,
    recordVisit,
    setTrashed,
    updateArtifact,
    windowOf,
} from "../core/artifacts";
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

artifacts.post("/artifacts", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    const cap = limit(featuresFor(ws), "maxArtifacts");
    if (!isUnlimited(cap) && (await liveArtifactCount(ws.id)) >= cap)
        return c.json(
            {
                error: `Your plan is limited to ${cap} artifacts — upgrade for unlimited.`,
                upgrade: true,
            },
            402,
        );
    const body = await readJson<ArtifactInput>(c);
    const id = await createArtifact(ws.id, c.get("user").id, body);
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
    const ok = await recordVisit(c.get("ws").id, c.req.param("id"), c.get("user").id);
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

artifacts.post("/artifacts/:id/trash", requireWorkspace, async (c) => {
    await setTrashed(c.get("ws").id, c.req.param("id"), new Date());
    return c.json({ ok: true });
});

artifacts.post("/artifacts/:id/restore", requireWorkspace, async (c) => {
    await setTrashed(c.get("ws").id, c.req.param("id"), null);
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
    const body = await readJson<ContentPatch>(c);
    const ops = Array.isArray(body.ops) ? body.ops.filter(isSectionOp) : [];
    if (!ops.length) return c.json({ error: "no ops" }, 400);
    const result = await applyContentOps(c.get("ws").id, c.req.param("id"), ops, {
        themeId: body.themeId,
        formatId: body.formatId,
    });
    if (result.status !== 200) return c.json({ error: result.error }, result.status);
    return c.json({ ok: true, updatedAt: result.updatedAt, total: result.total });
});

artifacts.patch("/artifacts/:id", requireWorkspace, async (c) => {
    const body = await readJson<ArtifactInput>(c);
    const a = await updateArtifact(c.get("ws").id, c.req.param("id"), body);
    return a ? c.json({ ok: true, updatedAt: a.updatedAt }) : c.json({ error: "not found" }, 404);
});
