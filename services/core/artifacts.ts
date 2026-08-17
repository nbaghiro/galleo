import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type {
    ArtifactContent,
    ArtifactInput,
    ArtifactPage,
    ArtifactWindow,
    ElementInstance,
    Section,
    SectionOp,
} from "@model/artifact";
import { applySectionOps, artifactDigest, asContent } from "@model/artifact";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { contentWrite } from "@services/db/derived";

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
    const { kind, section, id, ids, index, shell } = op as Record<string, unknown>;
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
        })
        .from(schema.artifacts)
        .where(
            and(
                eq(schema.artifacts.workspaceId, workspaceId),
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
    // every write derives the digest (db/derived.ts); null only on a row predating it
    const list = page.map(({ digest, updatedAt, trashedAt, ...meta }) => ({
        ...meta,
        updatedAt: updatedAt.toISOString(),
        trashedAt: trashedAt?.toISOString() ?? null,
        cover: digest?.cover ?? {},
        sections: digest?.sections ?? [],
        ...(digest?.page ? { page: digest.page } : {}),
    }));
    return {
        artifacts: list,
        nextCursor:
            rows.length > take && last ? encodeCursor({ key: keyOf(last), id: last.id }) : null,
    };
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

export async function createArtifact(
    workspaceId: string,
    userId: string,
    body: ArtifactInput,
): Promise<string | null> {
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            title: body.title ?? "Untitled",
            formatId: body.formatId ?? "deck",
            themeId: body.themeId ?? "studio",
            ...contentWrite(body.draftContent),
            folderId: body.folderId ?? null,
            aiMeta: body.aiMeta ?? null,
            createdBy: userId,
        })
        .returning({ id: schema.artifacts.id });
    return a?.id ?? null;
}

export async function readArtifact(workspaceId: string, id: string) {
    const [a] = await db.select().from(schema.artifacts).where(owned(id, workspaceId));
    return a ?? null;
}

// Only trusts the stored digest's index when it carries section ids: a digest written before
// windowed loading has none, and guessing them would strand unmatchable placeholders.
export function windowOf(
    a: NonNullable<Awaited<ReturnType<typeof readArtifact>>>,
    win: { from: number; count: number },
): ArtifactWindow {
    const content = asContent(a.draftContent);
    const { sections, ...shell } = content;
    const stored = a.digest?.sections;
    const index =
        stored?.length && stored.every((s) => s.id)
            ? stored
            : artifactDigest(a.draftContent).sections;
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
    };
}

export async function readAiMeta(workspaceId: string, id: string) {
    const [a] = await db
        .select({ aiMeta: schema.artifacts.aiMeta })
        .from(schema.artifacts)
        .where(owned(id, workspaceId));
    return a ? (a.aiMeta ?? null) : undefined; // undefined = no such artifact
}

export async function readSections(workspaceId: string, id: string): Promise<Section[] | null> {
    const [a] = await db
        .select({ draftContent: schema.artifacts.draftContent })
        .from(schema.artifacts)
        .where(owned(id, workspaceId));
    return a ? asContent(a.draftContent).sections : null;
}

export async function setTrashed(
    workspaceId: string,
    id: string,
    trashedAt: Date | null,
): Promise<void> {
    await db.update(schema.artifacts).set({ trashedAt }).where(owned(id, workspaceId));
}

// visits.ref has no FK (it spans artifacts and templates), so hard deletes drop the rows here
export async function deleteArtifact(workspaceId: string, id: string): Promise<void> {
    await db.transaction(async (tx) => {
        const gone = await tx
            .delete(schema.artifacts)
            .where(owned(id, workspaceId))
            .returning({ id: schema.artifacts.id });
        if (gone.length)
            await tx
                .delete(schema.visits)
                .where(and(eq(schema.visits.kind, "artifact"), eq(schema.visits.ref, id)));
    });
}

export async function emptyTrash(workspaceId: string): Promise<void> {
    await db.transaction(async (tx) => {
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
    });
}

export type ContentPatchResult =
    | { status: 404; error: string }
    | { status: 409; error: string }
    | { status: 200; updatedAt: Date; total: number };

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
        const [saved] = await tx
            .update(schema.artifacts)
            .set({
                ...contentWrite(next.content),
                ...(shell.themeId !== undefined ? { themeId: shell.themeId } : {}),
                ...(shell.formatId !== undefined ? { formatId: shell.formatId } : {}),
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
}

export async function updateArtifact(workspaceId: string, id: string, body: ArtifactInput) {
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.themeId !== undefined) patch.themeId = body.themeId;
    if (body.formatId !== undefined) patch.formatId = body.formatId;
    // re-derived, never trusted from the client
    if (body.draftContent !== undefined) Object.assign(patch, contentWrite(body.draftContent));
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
    const [a] = await db
        .update(schema.artifacts)
        .set(patch)
        .where(owned(id, workspaceId))
        .returning({ id: schema.artifacts.id, updatedAt: schema.artifacts.updatedAt });
    return a ?? null;
}
