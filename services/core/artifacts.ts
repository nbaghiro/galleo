import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import type {
    ArtifactAccess,
    ArtifactContent,
    ArtifactInput,
    ArtifactPage,
    ArtifactWindow,
    ElementInstance,
    Section,
    SectionOp,
} from "@model/artifact";
import { accessFor, applySectionOps, artifactDigest, asContent } from "@model/artifact";
import type { WorkspaceRole } from "@model/workspace";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { contentWrite } from "@services/db/derived";
import { assetIdsOf, adoptContentMedia, syncArtifactAssets } from "@services/core/media";
import type { Db } from "@services/db/client";
import { grantedTo } from "./collaborators";

// Keyset, not offset: the cursor names the last row seen, so a concurrent edit can't make a row repeat
// or vanish. A tampered or stale cursor degrades to "start from the beginning" rather than erroring.

export interface Cursor {
    key: string; // the sort column's value at the last row (ISO timestamp or title)
    id: string;
}

export function encodeCursor(c: Cursor): string {
    return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | undefined): Cursor | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
        if (!parsed || typeof parsed !== "object") return null;
        const { key, id } = parsed as Record<string, unknown>;
        return typeof key === "string" && typeof id === "string" ? { key, id } : null;
    } catch {
        return null;
    }
}

export function pageLimit(raw: string | undefined, fallback: number, max: number): number {
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(max, n);
}

// "from:count"; anything malformed means "no window", i.e. the whole artifact
export function parseWindow(raw: string | undefined): { from: number; count: number } | null {
    if (!raw) return null;
    const [a, b] = raw.split(":");
    const from = Math.trunc(Number(a));
    const count = Math.trunc(Number(b));
    if (!Number.isFinite(from) || !Number.isFinite(count) || from < 0 || count <= 0) return null;
    return { from, count: Math.min(count, 200) };
}

// A section with no root has no content tree, so it would reach the renderer as a hole; the check
// stops at `root.type` because the element tree below it is the element registry's contract.
const isElementInstance = (v: unknown): v is ElementInstance =>
    !!v && typeof v === "object" && typeof (v as { type?: unknown }).type === "string";

export const isSection = (v: unknown): v is Section => {
    if (!v || typeof v !== "object") return false;
    const { id, root } = v as Record<string, unknown>;
    return typeof id === "string" && isElementInstance(root);
};

// Shell fields are not required: asContent() fills format/theme from defaults, so a body that
// carries only sections is a legitimate write rather than a malformed one.
export const isArtifactContent = (v: unknown): v is ArtifactContent => {
    if (!v || typeof v !== "object") return false;
    const { format, theme, sections } = v as Record<string, unknown>;
    if (format !== undefined && typeof format !== "string") return false;
    if (theme !== undefined && typeof theme !== "string") return false;
    return Array.isArray(sections) && sections.every(isSection);
};

// A guard, not a parse: it must not rebuild the op, or optional fields the wire carries but this
// file does not enumerate (Section.frame) would be silently dropped on the way to the database.
export const isSectionOp = (op: unknown): op is SectionOp => {
    if (!op || typeof op !== "object") return false;
    const { kind, section, id, ids, index, shell, sectionId, elementId, keys } = op as Record<
        string,
        unknown
    >;
    // keys stays unknown-valued: what an element's data may hold is the element registry's contract
    if (kind === "data")
        return (
            typeof sectionId === "string" &&
            typeof elementId === "string" &&
            !!keys &&
            typeof keys === "object" &&
            !Array.isArray(keys)
        );
    if (kind === "set") return isSection(section);
    // a missing index reaches Math.trunc as NaN, which splice coerces to 0, so an unindexed
    // insert would silently prepend instead of being rejected
    if (kind === "insert") return isSection(section) && Number.isFinite(index);
    if (kind === "remove") return typeof id === "string";
    if (kind === "order") return Array.isArray(ids) && ids.every((x) => typeof x === "string");
    if (kind === "shell") return !!shell && typeof shell === "object";
    return false;
};

const owned = (id: string, workspaceId: string) =>
    and(eq(schema.artifacts.id, id), eq(schema.artifacts.workspaceId, workspaceId));

export interface ListOptions {
    trashed: boolean;
    alpha: boolean;
    folder?: string;
    format?: string;
    take: number;
    cursor: Cursor | null;
    viewer: Viewer;
}

export interface Viewer {
    userId: string;
    role: WorkspaceRole;
    workspaceDefault: ArtifactAccess;
}

// The rows a viewer may see at all. Built positively rather than as NOT(hidden): `member_access` is
// nullable, and negating a comparison against NULL yields NULL, which would drop the inheriting
// rows. A direct grant is one of the positive terms, so an artifact locked to a member but shared
// with them by name stays in their library rather than being reachable only by URL.
function visibleTo(v: Viewer) {
    if (v.role !== "member") return undefined;
    const mine = eq(schema.artifacts.createdBy, v.userId);
    const notNone = ne(schema.artifacts.memberAccess, "none");
    const granted = grantedTo(v.userId, schema.artifacts.id);
    return v.workspaceDefault === "none"
        ? or(mine, and(isNotNull(schema.artifacts.memberAccess), notNone), granted)
        : or(mine, isNull(schema.artifacts.memberAccess), notNone, granted);
}

// Filters apply server-side: a page is only coherent if both sides agree on what the list contains.
export async function listArtifacts(workspaceId: string, opts: ListOptions): Promise<ArtifactPage> {
    const { trashed, alpha, folder, format, take, cursor } = opts;
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
            createdBy: schema.artifacts.createdBy,
            memberAccess: schema.artifacts.memberAccess,
            grant: schema.artifactGrants.access,
        })
        .from(schema.artifacts)
        // a per-user grant is part of the level this row reports, so the badge in the library says
        // what the artifact will actually let this person do when they open it
        .leftJoin(
            schema.artifactGrants,
            and(
                eq(schema.artifactGrants.artifactId, schema.artifacts.id),
                eq(schema.artifactGrants.userId, opts.viewer.userId),
            ),
        )
        .where(
            and(
                eq(schema.artifacts.workspaceId, workspaceId),
                trashed
                    ? isNotNull(schema.artifacts.trashedAt)
                    : isNull(schema.artifacts.trashedAt),
                folder ? eq(schema.artifacts.folderId, folder) : undefined,
                format ? eq(schema.artifacts.formatId, format) : undefined,
                visibleTo(opts.viewer),
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
    // every write derives the digest (db/derived.ts); null only on a row predating it
    const list = page.map(
        ({ digest, updatedAt, trashedAt, createdBy, memberAccess, grant, ...meta }) => ({
            ...meta,
            updatedAt: updatedAt.toISOString(),
            trashedAt: trashedAt?.toISOString() ?? null,
            cover: digest?.cover ?? {},
            sections: digest?.sections ?? [],
            ...(digest?.page ? { page: digest.page } : {}),
            access: accessFor({
                role: opts.viewer.role,
                userId: opts.viewer.userId,
                createdBy,
                memberAccess,
                workspaceDefault: opts.viewer.workspaceDefault,
                grant,
            }),
        }),
    );
    return {
        artifacts: list,
        nextCursor:
            rows.length > take && last ? encodeCursor({ key: keyOf(last), id: last.id }) : null,
    };
}

// null clears the artifact back to inheriting the workspace default.
export async function setArtifactAccess(
    workspaceId: string,
    id: string,
    access: ArtifactAccess | null,
): Promise<boolean> {
    const [row] = await db
        .update(schema.artifacts)
        .set({ memberAccess: access })
        .where(owned(id, workspaceId))
        .returning({ id: schema.artifacts.id });
    return !!row;
}

export async function liveArtifactCount(workspaceId: string): Promise<number> {
    const live = await db
        .select({ id: schema.artifacts.id })
        .from(schema.artifacts)
        .where(
            and(eq(schema.artifacts.workspaceId, workspaceId), isNull(schema.artifacts.trashedAt)),
        );
    return live.length;
}

// Media normalization sits in front of the derived columns: content is rewritten so every picture
// it references is an asset row in this workspace, and only then are digest/search_text derived
// from it. Adopting inside the caller's transaction keeps the rows and the content atomic.
export async function contentColumns(
    workspaceId: string,
    content: unknown,
    tx: Db,
): Promise<{ columns: ReturnType<typeof contentWrite>; assetIds: string[] }> {
    const normalized = await adoptContentMedia(workspaceId, content, tx);
    return { columns: contentWrite(normalized), assetIds: assetIdsOf(normalized) };
}

/**
 * A caller naming a format or a theme is naming it in the content, because that is the only place
 * either is stored: `format_id` and `theme_id` are generated columns over `draft_content`, and a
 * write to one is a Postgres error rather than a divergence. What the caller sends wins over what
 * the tree already said, which is the precedence the columns used to have.
 */
const withShell = (content: unknown, shell: { formatId?: string; themeId?: string }): unknown =>
    !content || typeof content !== "object"
        ? content
        : {
              ...(content as Record<string, unknown>),
              ...(shell.formatId ? { format: shell.formatId } : {}),
              ...(shell.themeId ? { theme: shell.themeId } : {}),
          };

export async function createArtifact(
    workspaceId: string,
    userId: string,
    body: ArtifactInput,
): Promise<string | null> {
    return db.transaction(async (tx) => {
        const content = withShell(body.draftContent, body);
        const { columns, assetIds } = await contentColumns(workspaceId, content, tx);
        const [a] = await tx
            .insert(schema.artifacts)
            .values({
                workspaceId,
                title: body.title ?? "Untitled",
                ...columns,
                folderId: body.folderId ?? null,
                aiMeta: body.aiMeta ?? null,
                createdBy: userId,
            })
            .returning({ id: schema.artifacts.id });
        if (!a) return null;
        await syncArtifactAssets(a.id, assetIds, tx);
        return a.id;
    });
}

export type ArtifactRow = typeof schema.artifacts.$inferSelect;

export async function readArtifact(workspaceId: string, id: string): Promise<ArtifactRow | null> {
    const [a] = await db.select().from(schema.artifacts).where(owned(id, workspaceId));
    return a ?? null;
}

// The write path derives the digest on every write, so a row's digest is the index; deriving
// here is only for a null column, which contentWrite never leaves behind.
export function windowOf(
    a: NonNullable<Awaited<ReturnType<typeof readArtifact>>>,
    win: { from: number; count: number },
): ArtifactWindow {
    const content = asContent(a.draftContent);
    const { sections, ...shell } = content;
    const index = a.digest?.sections ?? artifactDigest(a.draftContent).sections;
    return {
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
        seq: a.seq,
    };
}

export async function readSections(workspaceId: string, id: string): Promise<Section[] | null> {
    const [a] = await db
        .select({ draftContent: schema.artifacts.draftContent })
        .from(schema.artifacts)
        .where(owned(id, workspaceId));
    return a ? asContent(a.draftContent).sections : null;
}

/** The row as it was before the move, which is what the trash events describe. */
export interface TrashedRow {
    formatId: string;
    createdAt: Date;
    trashedAt: Date | null;
    sectionCount: number;
}

export async function setTrashed(
    workspaceId: string,
    id: string,
    trashedAt: Date | null,
): Promise<TrashedRow | null> {
    const [before] = await db
        .select({
            formatId: schema.artifacts.formatId,
            createdAt: schema.artifacts.createdAt,
            trashedAt: schema.artifacts.trashedAt,
            // no section-count column: the tree is the only place it exists
            sections: sql<number>`jsonb_array_length(${schema.artifacts.draftContent} -> 'sections')`,
        })
        .from(schema.artifacts)
        .where(owned(id, workspaceId));
    await db.update(schema.artifacts).set({ trashedAt }).where(owned(id, workspaceId));
    return before ? { ...before, sectionCount: Number(before.sections) || 0 } : null;
}

// visits.ref has no FK (it spans artifacts and templates), so hard deletes drop the rows here
/** Days the artifact had been in the trash, or null when there was nothing to delete. */
export async function deleteArtifact(workspaceId: string, id: string): Promise<number | null> {
    return db.transaction(async (tx) => {
        const gone = await tx
            .delete(schema.artifacts)
            .where(owned(id, workspaceId))
            .returning({ id: schema.artifacts.id, trashedAt: schema.artifacts.trashedAt });
        if (gone.length)
            await tx
                .delete(schema.visits)
                .where(and(eq(schema.visits.kind, "artifact"), eq(schema.visits.ref, id)));
        const at = gone[0]?.trashedAt;
        return at ? Math.round((Date.now() - at.getTime()) / (24 * 3_600_000)) : null;
    });
}

/** How many artifacts were wiped. */
export async function emptyTrash(workspaceId: string): Promise<number> {
    return db.transaction(async (tx) => {
        const gone = await tx
            .delete(schema.artifacts)
            .where(
                and(
                    eq(schema.artifacts.workspaceId, workspaceId),
                    isNotNull(schema.artifacts.trashedAt),
                ),
            )
            .returning({ id: schema.artifacts.id });
        if (gone.length)
            await tx.delete(schema.visits).where(
                and(
                    eq(schema.visits.kind, "artifact"),
                    inArray(
                        schema.visits.ref,
                        gone.map((g) => g.id),
                    ),
                ),
            );
        return gone.length;
    });
}

export type ContentPatchResult =
    | { status: 404; error: string }
    | { status: 409; error: string }
    | { status: 200; updatedAt: Date; total: number; seq: number };

// Bumped inside the transaction of every content write, so the number a writer gets back is the
// order the room broadcasts in and a reconnecting client can ask "what have I missed since".
const nextSeq = sql`${schema.artifacts.seq} + 1`;

/**
 * Read, apply, and re-derive in one transaction; a batch naming a section the server doesn't have is
 * rejected whole (409) so the two sides resynchronize rather than diverge quietly.
 */
export function applyContentOps(
    workspaceId: string,
    id: string,
    ops: SectionOp[],
    shell: { themeId?: string; formatId?: string },
): Promise<ContentPatchResult> {
    const where = owned(id, workspaceId);
    return db.transaction(async (tx) => {
        const [row] = await tx
            .select({ draftContent: schema.artifacts.draftContent })
            .from(schema.artifacts)
            .where(where)
            .for("update");
        if (!row) return { status: 404 as const, error: "not found" };
        const next = applySectionOps(asContent(row.draftContent), ops);
        if (!next.ok) return { status: 409 as const, error: next.reason };
        // A `shell` op already carries these into the tree; a caller naming them alongside its ops
        // is saying the same thing, so both land in one place rather than in a second column.
        const content = withShell(next.content, shell);
        const { columns, assetIds } = await contentColumns(workspaceId, content, tx);
        const [saved] = await tx
            .update(schema.artifacts)
            .set({
                ...columns,
                updatedAt: new Date(),
                seq: nextSeq,
            })
            .where(where)
            .returning({ updatedAt: schema.artifacts.updatedAt, seq: schema.artifacts.seq });
        await syncArtifactAssets(id, assetIds, tx);
        return {
            status: 200 as const,
            updatedAt: saved!.updatedAt,
            total: next.content.sections.length,
            seq: saved!.seq,
        };
    });
}

export async function updateArtifact(workspaceId: string, id: string, body: ArtifactInput) {
    return db.transaction(async (tx) => {
        const patch: Record<string, unknown> = {};
        let assetIds: string[] | null = null;
        if (body.title !== undefined) patch.title = body.title;
        // A format or a theme is a change to the content, since that is where both live. Naming one
        // without sending a tree means reading the stored one and moving it, rather than writing a
        // column: there is no column to write.
        const shellOnly =
            body.draftContent === undefined &&
            (body.formatId !== undefined || body.themeId !== undefined);
        const source = shellOnly
            ? await tx
                  .select({ draftContent: schema.artifacts.draftContent })
                  .from(schema.artifacts)
                  .where(owned(id, workspaceId))
                  .for("update")
                  .then(([row]) => row?.draftContent)
            : body.draftContent;
        // re-derived, never trusted from the client
        if (source !== undefined) {
            const derived = await contentColumns(workspaceId, withShell(source, body), tx);
            Object.assign(patch, derived.columns);
            assetIds = derived.assetIds;
            patch.seq = nextSeq; // a whole-document save is a revision too, so the room can order it
        }
        if (body.folderId !== undefined) patch.folderId = body.folderId;
        // a run saves its content first and its provenance with the same call, so this arrives on PATCH too
        if (body.aiMeta !== undefined) patch.aiMeta = body.aiMeta;
        // a folder-only move shouldn't reorder the library; bump updatedAt only for real edits
        if (
            body.title !== undefined ||
            body.themeId !== undefined ||
            body.formatId !== undefined ||
            body.draftContent !== undefined
        ) {
            patch.updatedAt = new Date();
        }
        const [a] = await tx
            .update(schema.artifacts)
            .set(patch)
            .where(owned(id, workspaceId))
            .returning({
                id: schema.artifacts.id,
                updatedAt: schema.artifacts.updatedAt,
                seq: schema.artifacts.seq,
            });
        if (a && assetIds) await syncArtifactAssets(a.id, assetIds, tx);
        return a ?? null;
    });
}
