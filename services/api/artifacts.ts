import { Hono } from "hono";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type {
    ArtifactContent,
    ArtifactInput,
    ArtifactPage,
    ArtifactWindow,
    ContentPatch,
    Section,
    SectionOp,
} from "@model/artifact";
import { applySectionOps } from "@model/content";
import { artifactDigest, artifactSearchText } from "@model/digest";
import { isUnlimited } from "@model/billing";
import { limit } from "@model/features";
import { db, schema } from "../schema";
import { SESSION_COOKIE } from "../auth";
import { featuresFor } from "../features";
import { currentUser, currentWorkspace, firstWorkspaceId, readJson } from "./context";
import { decodeCursor, encodeCursor, pageLimit } from "./pagination";

export const artifacts = new Hono();

const LIST_LIMIT = 24;
const LIST_MAX = 100;

// Filters apply server-side: a page is only coherent if both sides agree on what the list contains.
artifacts.get("/artifacts", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ artifacts: [], nextCursor: null } satisfies ArtifactPage);
    const trashed = c.req.query("trashed") === "1";
    const alpha = c.req.query("sort") === "az";
    const folder = c.req.query("folder");
    const format = c.req.query("format");
    const take = pageLimit(c.req.query("limit"), LIST_LIMIT, LIST_MAX);
    const cursor = decodeCursor(c.req.query("cursor"));

    // A–Z sorts on lower(title), not by ASCII case.
    const timeCol = trashed ? schema.artifacts.trashedAt : schema.artifacts.updatedAt;
    const sortKey = alpha ? sql`lower(${schema.artifacts.title})` : sql`${timeCol}`;
    const keyOf = (row: { title: string; updatedAt: Date; trashedAt: Date | null }): string =>
        alpha
            ? row.title.toLowerCase()
            : ((trashed ? row.trashedAt : row.updatedAt)?.toISOString() ?? "");
    // the casts keep uuid/timestamp comparable to the text cursor params
    const seek = cursor
        ? alpha
            ? sql`(${sortKey}, ${schema.artifacts.id}) > (${cursor.key}, ${cursor.id}::uuid)`
            : sql`(${sortKey}, ${schema.artifacts.id}) < (${cursor.key}::timestamp, ${cursor.id}::uuid)`
        : undefined;

    const rows = await db
        .select({
            id: schema.artifacts.id,
            title: schema.artifacts.title,
            themeId: schema.artifacts.themeId,
            formatId: schema.artifacts.formatId,
            folderId: schema.artifacts.folderId,
            updatedAt: schema.artifacts.updatedAt,
            trashedAt: schema.artifacts.trashedAt,
            digest: schema.artifacts.digest,
        })
        .from(schema.artifacts)
        .where(
            and(
                eq(schema.artifacts.workspaceId, ws),
                trashed
                    ? isNotNull(schema.artifacts.trashedAt)
                    : isNull(schema.artifacts.trashedAt),
                folder ? eq(schema.artifacts.folderId, folder) : undefined,
                format ? eq(schema.artifacts.formatId, format) : undefined,
                seek,
            ),
        )
        .orderBy(
            alpha ? sql`${sortKey} asc` : sql`${sortKey} desc`,
            alpha ? asc(schema.artifacts.id) : desc(schema.artifacts.id),
        )
        .limit(take + 1); // one extra row answers "is there a next page" without a count query

    const page = rows.slice(0, take);
    const last = page.at(-1);
    // digest is null only until `db:backfill-search` has visited a pre-index row
    const list = page.map(({ digest, updatedAt, trashedAt, ...meta }) => ({
        ...meta,
        updatedAt: updatedAt.toISOString(),
        trashedAt: trashedAt?.toISOString() ?? null,
        cover: digest?.cover ?? {},
        sections: digest?.sections ?? [],
    }));
    return c.json({
        artifacts: list,
        nextCursor:
            rows.length > take && last ? encodeCursor({ key: keyOf(last), id: last.id }) : null,
    } satisfies ArtifactPage);
});

artifacts.post("/artifacts", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
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
            digest: artifactDigest(body.draftContent),
            searchText: artifactSearchText(body.draftContent),
            folderId: body.folderId ?? null,
            createdBy: u.id,
        })
        .returning({ id: schema.artifacts.id });
    if (!a) return c.json({ error: "create failed" }, 500);
    return c.json({ id: a.id });
});

const asContent = (draft: unknown): ArtifactContent => {
    const d = (draft ?? {}) as Partial<ArtifactContent>;
    return {
        format: d.format ?? "deck",
        theme: d.theme ?? "studio",
        sections: Array.isArray(d.sections) ? d.sections : [],
        ...(d.background ? { background: d.background } : {}),
    };
};

// "from:count"; anything malformed means "no window", i.e. the whole artifact
function parseWindow(raw: string | undefined): { from: number; count: number } | null {
    if (!raw) return null;
    const [a, b] = raw.split(":");
    const from = Math.trunc(Number(a));
    const count = Math.trunc(Number(b));
    if (!Number.isFinite(from) || !Number.isFinite(count) || from < 0 || count <= 0) return null;
    return { from, count: Math.min(count, 200) };
}

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
    const win = parseWindow(c.req.query("window"));
    if (win) {
        const content = asContent(a.draftContent);
        const { sections, ...shell } = content;
        // Only trust the stored digest's index when it carries section ids: a digest written before
        // windowed loading has none, and guessing them would strand unmatchable placeholders.
        const stored = a.digest?.sections;
        const index =
            stored?.length && stored.every((s) => s.id)
                ? stored
                : artifactDigest(a.draftContent).sections;
        return c.json({
            artifact: {
                id: a.id,
                title: a.title,
                themeId: a.themeId,
                formatId: a.formatId,
                updatedAt: a.updatedAt.toISOString(),
                shell,
                total: sections.length,
                index,
                from: win.from,
                sections: sections.slice(win.from, win.from + win.count),
            } satisfies ArtifactWindow,
        });
    }
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

artifacts.get("/artifacts/:id/sections", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const [a] = await db
        .select({ draftContent: schema.artifacts.draftContent })
        .from(schema.artifacts)
        .where(
            and(eq(schema.artifacts.id, c.req.param("id")), eq(schema.artifacts.workspaceId, ws)),
        );
    if (!a) return c.json({ error: "not found" }, 404);
    const all = asContent(a.draftContent).sections;
    const ids = c.req.query("ids");
    if (ids) {
        const want = new Set(ids.split(",").filter(Boolean).slice(0, 200));
        return c.json({ sections: all.filter((s) => want.has(s.id)) });
    }
    const win = parseWindow(c.req.query("window")) ?? { from: 0, count: 24 };
    return c.json({ sections: all.slice(win.from, win.from + win.count) });
});

// The read clock behind "Recent" in ⌘K and the library.
artifacts.post("/artifacts/:id/visit", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const [a] = await db
        .select({ id: schema.artifacts.id })
        .from(schema.artifacts)
        .where(
            and(eq(schema.artifacts.id, c.req.param("id")), eq(schema.artifacts.workspaceId, ws)),
        );
    if (!a) return c.json({ error: "not found" }, 404);
    await db
        .insert(schema.artifactVisits)
        .values({ userId: u.id, artifactId: a.id })
        .onConflictDoUpdate({
            target: [schema.artifactVisits.userId, schema.artifactVisits.artifactId],
            set: { viewedAt: new Date(), views: sql`${schema.artifactVisits.views} + 1` },
        });
    return c.json({ ok: true });
});

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

const isSectionOp = (op: unknown): op is SectionOp => {
    if (!op || typeof op !== "object") return false;
    const { kind, section, id, ids, shell } = op as Record<string, unknown>;
    if (kind === "set" || kind === "insert")
        return !!section && typeof (section as Section).id === "string";
    if (kind === "remove") return typeof id === "string";
    if (kind === "order") return Array.isArray(ids) && ids.every((x) => typeof x === "string");
    if (kind === "shell") return !!shell && typeof shell === "object";
    return false;
};

/**
 * Read, apply, and re-derive in one transaction; a batch naming a section the server doesn't have is
 * rejected whole (409) so the two sides resynchronize rather than diverge quietly.
 */
artifacts.patch("/artifacts/:id/content", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const body = await readJson<ContentPatch>(c);
    const ops = Array.isArray(body.ops) ? body.ops.filter(isSectionOp) : [];
    if (!ops.length) return c.json({ error: "no ops" }, 400);
    const where = and(
        eq(schema.artifacts.id, c.req.param("id")),
        eq(schema.artifacts.workspaceId, ws),
    );

    const result = await db.transaction(async (tx) => {
        const [row] = await tx
            .select({ draftContent: schema.artifacts.draftContent })
            .from(schema.artifacts)
            .where(where)
            .for("update");
        if (!row) return { status: 404 as const, error: "not found" };
        const next = applySectionOps(asContent(row.draftContent), ops);
        if (!next.ok) return { status: 409 as const, error: next.reason };
        const [saved] = await tx
            .update(schema.artifacts)
            .set({
                draftContent: next.content,
                digest: artifactDigest(next.content),
                searchText: artifactSearchText(next.content),
                ...(body.themeId !== undefined ? { themeId: body.themeId } : {}),
                ...(body.formatId !== undefined ? { formatId: body.formatId } : {}),
                updatedAt: new Date(),
            })
            .where(where)
            .returning({ updatedAt: schema.artifacts.updatedAt, total: sql<number>`1` });
        return {
            status: 200 as const,
            updatedAt: saved!.updatedAt,
            total: next.content.sections.length,
        };
    });
    if (result.status !== 200) return c.json({ error: result.error }, result.status);
    return c.json({ ok: true, updatedAt: result.updatedAt, total: result.total });
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
    if (body.draftContent !== undefined) {
        patch.draftContent = body.draftContent;
        // re-derived here, never trusted from the client; search_tsv follows search_text automatically
        patch.digest = artifactDigest(body.draftContent);
        patch.searchText = artifactSearchText(body.draftContent);
    }
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
