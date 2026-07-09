import { Hono } from "hono";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type { ArtifactInput, Cover, SectionSummary } from "@model/artifact";
import { isUnlimited } from "@model/billing";
import { limit } from "@model/features";
import { db, schema } from "../schema";
import { SESSION_COOKIE } from "../auth";
import { featuresFor } from "../features";
import { currentUser, currentWorkspace, firstWorkspaceId, readJson } from "./context";

// Artifact + Trash routes: list, create, read, patch (autosave), soft-delete/restore, and permanent
// delete. The library list rows carry a lightweight cover + section filmstrip derived from the draft.
export const artifacts = new Hono();

// A tiny cover snippet (eyebrow · title · sub) pulled from the first section, so the library can
// render a faithful preview without shipping the whole document.
interface RawEl {
    type?: string;
    data?: { style?: string; text?: string; src?: string; children?: RawEl[] };
}
interface RawDraft {
    background?: { image?: string };
    sections?: { background?: { image?: string }; cells?: Record<string, { element?: RawEl }> }[];
}

// Depth-first visit of a raw draft element + its nested group children.
const walkRaw = (el: RawEl | undefined, visit: (el: RawEl) => void): void => {
    if (!el) return;
    visit(el);
    for (const ch of el.data?.children ?? []) walkRaw(ch, visit);
};

function coverOf(draft: unknown): Cover {
    const d = draft as RawDraft;
    const sec = d.sections?.[0];
    if (!sec) return {};
    const texts: { style?: string; text?: string }[] = [];
    let image = d.background?.image ?? sec.background?.image;
    for (const cell of Object.values(sec.cells ?? {}))
        walkRaw(cell.element, (el) => {
            if (el.type === "text" && el.data)
                texts.push({ style: el.data.style, text: el.data.text });
            if (el.type === "image" && !image && el.data?.src) image = el.data.src;
        });
    const find = (...styles: string[]): string | undefined =>
        texts.find((t) => t.style && styles.includes(t.style))?.text;
    return {
        eyebrow: find("label"),
        title: find("h1", "h2", "h3"),
        sub: find("subtitle", "body", "caption"),
        image,
    };
}

// A per-section summary for the library "filmstrip" — a short label + a coarse kind for each section,
// so a layout can preview/navigate the document's structure without shipping the whole thing.
function sectionsSummary(draft: unknown): SectionSummary[] {
    const d = draft as RawDraft;
    return (d.sections ?? []).map((sec, idx) => {
        let title: string | undefined;
        const kinds = new Set<string>();
        for (const cell of Object.values(sec.cells ?? {}))
            walkRaw(cell.element, (el) => {
                if (el.type === "text" && el.data) {
                    const st = el.data.style;
                    if (el.data.text && !title && st && !["label", "caption"].includes(st))
                        title = el.data.text;
                }
                if (el.type && !["text", "group", "card", "cell"].includes(el.type))
                    kinds.add(el.type);
            });
        let kind = "cover";
        if (idx > 0) {
            kind = "content";
            if (kinds.has("chart")) kind = "chart";
            else if (kinds.has("table")) kind = "table";
            else if (kinds.has("diagram")) kind = "diagram";
            else if (
                kinds.has("image") ||
                kinds.has("video") ||
                kinds.has("embed") ||
                sec.background?.image
            )
                kind = "media";
            else if (kinds.has("stat")) kind = "stat";
            else if (kinds.has("quote")) kind = "quote";
        }
        return { title: title?.slice(0, 64), kind };
    });
}

artifacts.get("/artifacts", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ artifacts: [] });
    const trashed = c.req.query("trashed") === "1"; // ?trashed=1 → the Trash list, else live artifacts
    const rows = await db
        .select({
            id: schema.artifacts.id,
            title: schema.artifacts.title,
            themeId: schema.artifacts.themeId,
            formatId: schema.artifacts.formatId,
            folderId: schema.artifacts.folderId,
            updatedAt: schema.artifacts.updatedAt,
            trashedAt: schema.artifacts.trashedAt,
            draftContent: schema.artifacts.draftContent,
        })
        .from(schema.artifacts)
        .where(
            and(
                eq(schema.artifacts.workspaceId, ws),
                trashed
                    ? isNotNull(schema.artifacts.trashedAt)
                    : isNull(schema.artifacts.trashedAt),
            ),
        )
        .orderBy(desc(trashed ? schema.artifacts.trashedAt : schema.artifacts.updatedAt));
    const list = rows.map(({ draftContent, ...meta }) => ({
        ...meta,
        cover: coverOf(draftContent),
        sections: sectionsSummary(draftContent),
    }));
    return c.json({ artifacts: list });
});

artifacts.post("/artifacts", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    // Plan gate: some tiers cap the number of live artifacts (resolved via the feature layer).
    const cap = limit(featuresFor(ws), "maxArtifacts");
    if (!isUnlimited(cap)) {
        const live = await db
            .select({ id: schema.artifacts.id })
            .from(schema.artifacts)
            .where(
                and(eq(schema.artifacts.workspaceId, ws.id), isNull(schema.artifacts.trashedAt)),
            );
        if (live.length >= cap)
            return c.json(
                {
                    error: `Your plan is limited to ${cap} artifacts — upgrade for unlimited.`,
                    upgrade: true,
                },
                402,
            );
    }
    const body = await readJson<ArtifactInput>(c);
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId: ws.id,
            title: body.title ?? "Untitled",
            formatId: body.formatId ?? "deck",
            themeId: body.themeId ?? "studio",
            draftContent: body.draftContent ?? {},
            folderId: body.folderId ?? null,
            createdBy: u.id,
        })
        .returning({ id: schema.artifacts.id });
    if (!a) return c.json({ error: "create failed" }, 500);
    return c.json({ id: a.id });
});

artifacts.get("/artifacts/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const [a] = await db
        .select()
        .from(schema.artifacts)
        .where(
            and(eq(schema.artifacts.id, c.req.param("id")), eq(schema.artifacts.workspaceId, ws)),
        );
    if (!a) return c.json({ error: "not found" }, 404);
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

// soft delete → moves to Trash (recoverable)
artifacts.post("/artifacts/:id/trash", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    await db
        .update(schema.artifacts)
        .set({ trashedAt: new Date() })
        .where(
            and(eq(schema.artifacts.id, c.req.param("id")), eq(schema.artifacts.workspaceId, ws)),
        );
    return c.json({ ok: true });
});

// restore from Trash
artifacts.post("/artifacts/:id/restore", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    await db
        .update(schema.artifacts)
        .set({ trashedAt: null })
        .where(
            and(eq(schema.artifacts.id, c.req.param("id")), eq(schema.artifacts.workspaceId, ws)),
        );
    return c.json({ ok: true });
});

// permanent delete (one item — used from Trash)
artifacts.delete("/artifacts/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    await db
        .delete(schema.artifacts)
        .where(
            and(eq(schema.artifacts.id, c.req.param("id")), eq(schema.artifacts.workspaceId, ws)),
        );
    return c.json({ ok: true });
});

// empty Trash — permanently delete every trashed artifact in the workspace
artifacts.delete("/trash", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    await db
        .delete(schema.artifacts)
        .where(and(eq(schema.artifacts.workspaceId, ws), isNotNull(schema.artifacts.trashedAt)));
    return c.json({ ok: true });
});

artifacts.patch("/artifacts/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const body = await readJson<ArtifactInput>(c);
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.themeId !== undefined) patch.themeId = body.themeId;
    if (body.formatId !== undefined) patch.formatId = body.formatId;
    if (body.draftContent !== undefined) patch.draftContent = body.draftContent;
    if (body.folderId !== undefined) patch.folderId = body.folderId;
    // a folder-only move shouldn't reorder the library; bump updatedAt only for real edits
    if (
        body.title !== undefined ||
        body.themeId !== undefined ||
        body.formatId !== undefined ||
        body.draftContent !== undefined
    ) {
        patch.updatedAt = new Date();
    }
    const [a] = await db
        .update(schema.artifacts)
        .set(patch)
        .where(
            and(eq(schema.artifacts.id, c.req.param("id")), eq(schema.artifacts.workspaceId, ws)),
        )
        .returning({ id: schema.artifacts.id, updatedAt: schema.artifacts.updatedAt });
    if (!a) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, updatedAt: a.updatedAt });
});
