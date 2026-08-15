import { sql } from "drizzle-orm";
import type { ArtifactDigest, SearchHit, SearchSnippet } from "@model/artifact";
import { db } from "@services/db/client";

// Searches the FTS columns maintained at write time by db/derived.ts.

// Control chars, not tags, so a headline marker can't be mistaken for markup; the route converts
// them to offsets before responding.
const START = "\u0002";
const STOP = "\u0003";

const HEADLINE_OPTS = `MaxFragments=1,MinWords=6,MaxWords=18,StartSel=${START},StopSel=${STOP}`;

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
const MAX_OFFSET = 500; // deep paging past this is a filter problem, not a paging problem
const MAX_TERMS = 8; // a pathological query shouldn't turn into a 200-lexeme AND

/**
 * User input → a safe tsquery: terms ANDed, the last a prefix. Non-alphanumerics are dropped so no
 * operator reaches the parser. Null when nothing indexable is left.
 */
export function toTsQuery(input: string): string | null {
    const terms = input
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, " ")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, MAX_TERMS);
    if (!terms.length) return null;
    return terms.map((t, i) => (i === terms.length - 1 ? `${t}:*` : t)).join(" & ");
}

/** Escape LIKE wildcards so a typed % or _ matches itself. */
export const likeTerm = (input: string): string => input.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Headline string with sentinel markers → display text plus [start, end) highlight ranges. Whitespace
 * collapses as it goes, so offsets are taken against the single line actually rendered.
 */
export function parseSnippet(raw: string | null | undefined): SearchSnippet | null {
    if (!raw) return null;
    let text = "";
    const marks: [number, number][] = [];
    let open = -1;
    for (const ch of raw) {
        if (ch === START) {
            open = text.length;
        } else if (ch === STOP) {
            if (open >= 0 && text.length > open) marks.push([open, text.length]);
            open = -1;
        } else if (/\s/.test(ch)) {
            if (text && !text.endsWith(" ")) text += " ";
        } else {
            text += ch;
        }
    }
    const trimmed = text.trimEnd();
    if (!trimmed) return null;
    return { text: trimmed, marks: marks.filter(([a, b]) => b <= trimmed.length && b > a) };
}

type Row = {
    id: string;
    title: string;
    format_id: string;
    theme_id: string;
    folder_id: string | null;
    updated_at: Date;
    digest: ArtifactDigest | null;
    created_by: string | null;
    author_name: string | null;
    author_avatar: string | null;
    viewed_at: Date | null;
    title_hit?: boolean;
    snippet?: string | null;
};

const toHit = (r: Row): SearchHit => ({
    id: r.id,
    title: r.title,
    formatId: r.format_id,
    themeId: r.theme_id,
    folderId: r.folder_id,
    updatedAt: new Date(r.updated_at).toISOString(),
    cover: r.digest?.cover ?? {},
    sections: r.digest?.sections ?? [],
    author: r.created_by ? { name: r.author_name, avatarUrl: r.author_avatar } : null,
    lastViewedAt: r.viewed_at ? new Date(r.viewed_at).toISOString() : null,
    matchedIn: r.title_hit === false ? "content" : "title",
    snippet: parseSnippet(r.snippet),
});

const clampLimit = (n: number | undefined): number =>
    Math.max(1, Math.min(MAX_LIMIT, Math.trunc(n ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));

// rank order is stable for a given query, so offset is a correct page boundary here
const clampOffset = (n: number | undefined): number =>
    Math.max(0, Math.min(MAX_OFFSET, Math.trunc(n ?? 0) || 0));

/** What this user last opened, falling back to updatedAt so a never-opened artifact still surfaces. */
export async function recentArtifacts(opts: {
    workspaceId: string;
    userId: string;
    limit?: number;
}): Promise<SearchHit[]> {
    const rows = await db.execute<Row>(sql`
        SELECT a.id, a.title, a.format_id, a.theme_id, a.folder_id, a.updated_at, a.digest,
               a.created_by, u.name AS author_name, u.avatar_url AS author_avatar,
               v.seen_at AS viewed_at
        FROM artifacts a
        LEFT JOIN users u ON u.id = a.created_by
        LEFT JOIN visits v ON v.kind = 'artifact' AND v.ref = a.id::text AND v.user_id = ${opts.userId}
        WHERE a.workspace_id = ${opts.workspaceId} AND a.trashed_at IS NULL
        ORDER BY GREATEST(v.seen_at, a.updated_at) DESC
        LIMIT ${clampLimit(opts.limit)}
    `);
    return [...rows].map((r) => toHit({ ...r, snippet: null }));
}

/**
 * Ranked FTS over title (weight A) and content (weight B), plus a title substring match so mid-word
 * fragments ("nomi" in "Economics") and stop-word queries still find something.
 */
export async function searchArtifacts(opts: {
    workspaceId: string;
    userId: string;
    query: string;
    limit?: number;
    offset?: number;
}): Promise<SearchHit[]> {
    const tsq = toTsQuery(opts.query);
    const contains = `%${likeTerm(opts.query.trim())}%`;
    const prefix = `${likeTerm(opts.query.trim())}%`;
    // an unindexable query (punctuation only) degrades to the title match rather than erroring
    const query = sql`to_tsquery('english', ${tsq ?? ""})`;
    const matches = tsq
        ? sql`(a.search_tsv @@ ${query} OR a.title ILIKE ${contains})`
        : sql`a.title ILIKE ${contains}`;
    const rank = tsq ? sql`ts_rank_cd(a.search_tsv, ${query}, 32)` : sql`0`;
    const rows = await db.execute<Row>(sql`
        WITH hits AS (
            SELECT a.id, a.title, a.format_id, a.theme_id, a.folder_id, a.updated_at, a.digest,
                   a.created_by, a.search_text,
                   (a.title ILIKE ${contains}) AS title_hit,
                   (a.title ILIKE ${prefix}) AS title_prefix,
                   ${rank} AS rank
            FROM artifacts a
            WHERE a.workspace_id = ${opts.workspaceId} AND a.trashed_at IS NULL AND ${matches}
            ORDER BY title_prefix DESC, title_hit DESC, rank DESC, a.updated_at DESC
            LIMIT ${clampLimit(opts.limit)} OFFSET ${clampOffset(opts.offset)}
        )
        SELECT h.id, h.title, h.format_id, h.theme_id, h.folder_id, h.updated_at, h.digest,
               h.title_hit, h.created_by, u.name AS author_name, u.avatar_url AS author_avatar,
               v.seen_at AS viewed_at,
               ${
                   tsq
                       ? sql`CASE WHEN h.title_hit THEN NULL
                                  ELSE ts_headline('english', coalesce(h.search_text, ''), ${query}, ${HEADLINE_OPTS})
                             END`
                       : sql`NULL`
               } AS snippet
        FROM hits h
        LEFT JOIN users u ON u.id = h.created_by
        LEFT JOIN visits v ON v.kind = 'artifact' AND v.ref = h.id::text AND v.user_id = ${opts.userId}
        ORDER BY h.title_prefix DESC, h.title_hit DESC, h.rank DESC, h.updated_at DESC
    `);
    return [...rows].map(toHit);
}
