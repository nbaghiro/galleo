import { Hono } from "hono";
import type { Context } from "hono";
import type { ArtifactContent, ArtifactPage, GenMeta } from "@model/artifact";
import { isAccess } from "@model/artifact";
import { featuresFor, isUnlimited, limit } from "@model/billing";
import { TEMPLATE_INDEX } from "@model/templates";
import { z } from "zod";
import { BAD_BODY, checkLimit, readJson } from "@services/utils/http";
import { capture } from "@services/utils/analytics";
import { asFormat } from "@model/analytics";
import { currentMembership, type WorkspaceRow } from "@services/core/accounts";
import { artifactCredits } from "@services/core/media";
import { recordArtifactVisit, recordTemplateUse } from "@services/core/visits";
import { markGrantSeen } from "@services/core/collaborators";
import { CONN_HEADER, openRoom, syncArtifactAccess } from "@services/core/collab";
import {
    applyContentOps,
    createArtifact,
    decodeCursor,
    deleteArtifact,
    ensureElementIds,
    emptyTrash,
    isArtifactContent,
    isSectionOp,
    listArtifacts,
    liveArtifactCount,
    setArtifactAccess,
    pageLimit,
    parseWindow,
    readAiMeta,
    readSections,
    setTrashed,
    stampedContent,
    updateArtifact,
    windowOf,
} from "@services/core/artifacts";
import {
    gateArtifact,
    gateShared,
    isResponse,
    requireRole,
    requireUser,
    requireWorkspace,
    type WorkspaceEnv,
} from "./middleware";

export const artifacts = new Hono<WorkspaceEnv>();

const LIST_LIMIT = 24;
const LIST_MAX = 100;

// A user with no workspace yet sees an empty library, not an error.
artifacts.get("/artifacts", requireUser, async (c) => {
    const user = c.get("user");
    const membership = await currentMembership(user.id);
    if (!membership) return c.json({ artifacts: [], nextCursor: null } satisfies ArtifactPage);
    const { ws, role } = membership;
    return c.json(
        await listArtifacts(ws.id, {
            trashed: c.req.query("trashed") === "1",
            alpha: c.req.query("sort") === "az",
            folder: c.req.query("folder"),
            format: c.req.query("format"),
            take: pageLimit(c.req.query("limit"), LIST_LIMIT, LIST_MAX),
            cursor: decodeCursor(c.req.query("cursor")),
            viewer: { userId: user.id, role, workspaceDefault: ws.defaultArtifactAccess },
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

// null is meaningful (inherit the workspace default), so nullish rather than optional
const zAccess = z.object({ access: z.string().nullish() });

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

// Artifact-scoped from here on: the gate resolves the workspace from the artifact row, so an
// invited collaborator reads their invitation rather than their own workspace's copy of nothing.
// Who to credit for the pictures in this artifact. Read separately from the content because the
// content carries asset references, not provenance: the row is the only place that lives.
artifacts.get("/artifacts/:id/credits", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "view");
    if (isResponse(gate)) return gate;
    return c.json({ credits: await artifactCredits(c.req.param("id")) });
});

artifacts.get("/artifacts/:id", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "view");
    if (isResponse(gate)) return gate;
    // A row written before element ids existed hands every reader a different client-minted set,
    // so anything anchored to one (a comment) dies on the next read. Stamp it before answering.
    const stamped = stampedContent(gate.artifact.draftContent)
        ? await ensureElementIds(gate.artifact.id)
        : null;
    const a = stamped ? { ...gate.artifact, draftContent: stamped } : gate.artifact;
    if (gate.grant) await markGrantSeen(a.id, c.get("user").id);
    const win = parseWindow(c.req.query("window"));
    if (win) return c.json({ artifact: { ...windowOf(a, win), access: gate.access } });
    return c.json({
        artifact: {
            id: a.id,
            title: a.title,
            themeId: a.themeId,
            formatId: a.formatId,
            draftContent: a.draftContent,
            updatedAt: a.updatedAt,
            access: gate.access,
            seq: a.seq,
        },
    });
});

artifacts.get("/artifacts/:id/ai-meta", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "view");
    if (isResponse(gate)) return gate;
    const meta = await readAiMeta(gate.ws.id, c.req.param("id"));
    return meta === undefined ? c.json({ error: "not found" }, 404) : c.json({ meta });
});

artifacts.get("/artifacts/:id/sections", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "view");
    if (isResponse(gate)) return gate;
    const all = await readSections(gate.ws.id, c.req.param("id"));
    if (!all) return c.json({ error: "not found" }, 404);
    const ids = c.req.query("ids");
    if (ids) {
        const want = new Set(ids.split(",").filter(Boolean).slice(0, 200));
        return c.json({ sections: all.filter((s) => want.has(s.id)) });
    }
    const win = parseWindow(c.req.query("window")) ?? { from: 0, count: 24 };
    return c.json({ sections: all.slice(win.from, win.from + win.count) });
});

artifacts.post("/artifacts/:id/visit", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "view");
    if (isResponse(gate)) return gate;
    const ok = await recordArtifactVisit(gate.ws.id, c.req.param("id"), c.get("user").id);
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

artifacts.post("/artifacts/:id/trash", requireWorkspace, async (c) => {
    const gate = await gateArtifact(c, c.req.param("id"), "edit");
    if (isResponse(gate)) return gate;
    const before = await setTrashed(c.get("ws").id, c.req.param("id"), new Date());
    // age_days and section_count are the difference between a quality signal and housekeeping: one
    // trashed minutes after generation is not the same act as one trashed after a month.
    if (before)
        capture({ userId: c.get("user").id, workspaceId: c.get("ws").id }, "artifact_trashed", {
            format: asFormat(before.formatId),
            age_days: Math.round((Date.now() - before.createdAt.getTime()) / (24 * 3_600_000)),
            section_count: before.sectionCount,
        });
    return c.json({ ok: true });
});

artifacts.post("/artifacts/:id/restore", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    const gate = await gateArtifact(c, c.req.param("id"), "edit");
    if (isResponse(gate)) return gate;
    const denied = await overArtifactCap(c, ws);
    if (denied) return denied;
    const before = await setTrashed(ws.id, c.req.param("id"), null);
    if (before?.trashedAt)
        capture({ userId: c.get("user").id, workspaceId: ws.id }, "artifact_restored", {
            days_in_trash: Math.round((Date.now() - before.trashedAt.getTime()) / (24 * 3_600_000)),
        });
    return c.json({ ok: true });
});

artifacts.delete("/artifacts/:id", requireWorkspace, async (c) => {
    const gate = await gateArtifact(c, c.req.param("id"), "edit");
    if (isResponse(gate)) return gate;
    const days = await deleteArtifact(c.get("ws").id, c.req.param("id"));
    if (days !== null)
        capture({ userId: c.get("user").id, workspaceId: c.get("ws").id }, "artifact_deleted", {
            days_in_trash: days,
        });
    return c.json({ ok: true });
});

// Wipes every member's trashed work at once, not just the caller's, so it is an admin call.
artifacts.delete("/trash", requireWorkspace, requireRole("admin"), async (c) => {
    const count = await emptyTrash(c.get("ws").id);
    capture({ userId: c.get("user").id, workspaceId: c.get("ws").id }, "trash_emptied", { count });
    return c.json({ ok: true });
});

// Who in the workspace may do what with this one artifact. Changing it is an edit-level act, so a
// member who can edit can also lock it; an admin can always undo that.
artifacts.put("/artifacts/:id/access", requireWorkspace, async (c) => {
    const gate = await gateArtifact(c, c.req.param("id"), "edit");
    if (isResponse(gate)) return gate;
    const body = await readJson(c, zAccess);
    if (!body) return c.json(BAD_BODY, 400);
    const access = body.access ?? null;
    if (access !== null && !isAccess(access))
        return c.json({ error: "that is not an access level" }, 400);
    const ok = await setArtifactAccess(c.get("ws").id, c.req.param("id"), access);
    if (!ok) return c.json({ error: "not found" }, 404);
    // everyone in the room resolved their level from the old value, so they all re-resolve
    await syncArtifactAccess(c.req.param("id"));
    capture({ userId: c.get("user").id, workspaceId: c.get("ws").id }, "artifact_access_changed", {
        to: access ?? "workspace_default",
    });
    return c.json({ ok: true, access });
});

artifacts.patch("/artifacts/:id/content", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "edit");
    if (isResponse(gate)) return gate;
    const body = await readJson(c, zContentPatch);
    if (!body) return c.json(BAD_BODY, 400);
    const ops = (body.ops ?? []).filter(isSectionOp);
    if (!ops.length) return c.json({ error: "no ops" }, 400);
    const result = await applyContentOps(gate.ws.id, c.req.param("id"), ops, {
        themeId: body.themeId,
        formatId: body.formatId,
    });
    if (result.status !== 200) return c.json({ error: result.error }, result.status);
    // An HTTP write still belongs in the room's stream, so everyone else watching sees it land.
    // The caller names its own socket (when it has one) so the room does not send the write back
    // to the client that just made it; the room only honours a connection that is actually theirs.
    openRoom(c.req.param("id"))?.publish(
        result.seq,
        { kind: "user", connId: c.req.header(CONN_HEADER) ?? "", userId: c.get("user").id },
        ops,
    );
    return c.json({ ok: true, updatedAt: result.updatedAt, total: result.total, seq: result.seq });
});

artifacts.patch("/artifacts/:id", requireUser, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "edit");
    if (isResponse(gate)) return gate;
    const body = await readJson(c, zArtifactInput);
    if (!body) return c.json(BAD_BODY, 400);
    // a grantee edits content, never the artifact's place in someone else's library
    if (!gate.role && body.folderId !== undefined)
        return c.json({ error: "only the owning workspace can move this artifact" }, 403);
    const a = await updateArtifact(gate.ws.id, c.req.param("id"), body);
    if (!a) return c.json({ error: "not found" }, 404);
    // A move is a library act worth counting; a rename carries nothing a query can use.
    if (body.folderId !== undefined)
        capture({ userId: c.get("user").id, workspaceId: gate.ws.id }, "artifact_moved", {
            to_folder: body.folderId !== null,
        });
    // a whole-document write has no ops to replay, so anyone in the room reloads from the new seq
    if (body.draftContent !== undefined) openRoom(c.req.param("id"))?.resyncAll(a.seq);
    return c.json({ ok: true, updatedAt: a.updatedAt, seq: a.seq });
});
