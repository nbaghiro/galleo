import type { Id } from "@model/artifact";

// Comment threads hang off content without living inside it: the row carries an anchor and the
// section the anchored element was in, so nothing here ever reaches the render commands. A thread
// always points at an element; the section id is a locator, for grouping, jumping, and noticing
// that the content a thread was written on is gone.

// a text anchor's range lives on the element's cm mark, whose value is the thread's root id
export type CommentAnchor = { kind: "element"; elementId: Id } | { kind: "text"; elementId: Id };

export interface CommentAuthor {
    id: string;
    name: string | null;
    avatarUrl: string | null;
}

/** GET /artifacts/:id/comments row. A reply carries its root's id in `parentId`. */
export interface CommentDto {
    id: string;
    parentId: string | null;
    sectionId: string;
    anchor: CommentAnchor;
    quote: string | null; // what the anchor covered when it was written, for a degraded thread
    body: string;
    resolvedAt: string | null; // roots only
    createdAt: string;
    updatedAt: string;
    author: CommentAuthor | null;
    // Resolved server-side, per reader: the editor shows an affordance only where the write would
    // be allowed, without ever learning who is signed in.
    mine: boolean; // the reader wrote it, so they may edit it
    canDelete: boolean; // the author, or someone who can already administer the workspace
}

/** POST /artifacts/:id/comments */
export interface CommentCreateBody {
    body: string;
    sectionId: string;
    anchor: CommentAnchor;
    quote?: string;
    parentId?: string; // set = a reply on that root
}

/** PATCH /comments/:id */
export interface CommentEditBody {
    body: string;
}

export const COMMENT_MAX_LENGTH = 10_000;
export const COMMENT_QUOTE_MAX_LENGTH = 500;

// `anchor` is jsonb, so what comes back is whatever some past version wrote.
export function isCommentAnchor(v: unknown): v is CommentAnchor {
    if (!v || typeof v !== "object") return false;
    const { kind, elementId } = v as Record<string, unknown>;
    if (kind === "element" || kind === "text")
        return typeof elementId === "string" && elementId.length > 0;
    return false;
}

export const anchorElementId = (anchor: CommentAnchor): Id => anchor.elementId;

/** A root comment plus its flat replies, oldest first. Replies never nest. */
export interface CommentThread {
    root: CommentDto;
    replies: CommentDto[];
}

/** Groups a flat list (already in creation order) into threads, keeping that order. */
export function threadsOf(comments: CommentDto[]): CommentThread[] {
    const replies = new Map<string, CommentDto[]>();
    for (const c of comments) {
        if (!c.parentId) continue;
        const list = replies.get(c.parentId);
        if (list) list.push(c);
        else replies.set(c.parentId, [c]);
    }
    return comments
        .filter((c) => !c.parentId)
        .map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
}

export const isResolved = (thread: CommentThread): boolean => thread.root.resolvedAt !== null;

// How far a thread still resolves against the document on screen. Element ids are minted per tree,
// so a section an AI turn rewrote drops them: the thread leaves the canvas and lives on in the rail
// with the quote it was written against.
export type AnchorState = "text" | "element" | "orphan";

export function anchorStateOf(
    anchor: CommentAnchor,
    found: { element: boolean; mark?: boolean },
): AnchorState {
    if (!found.element) return "orphan";
    if (anchor.kind === "text" && found.mark === false) return "element"; // the range was edited away
    return anchor.kind;
}

export const isDegraded = (state: AnchorState, anchor: CommentAnchor): boolean =>
    state !== anchor.kind;
