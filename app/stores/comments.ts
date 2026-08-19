import type { CommentCreateBody, CommentDto } from "@model/comments";
import { setComments } from "@editor/core/comments";
import { api } from "@app/api";
import { reportError } from "./errors";
import { flushAutosave } from "./save";

// The wire half of commenting. Threads reach the editor only through the seam in
// @editor/core/comments, so the refresh below is the one thing an SSE channel would replace.
// Mutations refetch rather than patching the list: comment traffic is small and correctness wins.

const POLL_MS = 30_000;

let artifactId: string | null = null;
let timer = 0;

export function openComments(id: string): void {
    artifactId = id;
    setComments([]);
    void refreshComments();
    startSync();
}

export function closeComments(): void {
    artifactId = null;
    stopSync();
    setComments([]);
}

export async function refreshComments(): Promise<void> {
    const id = artifactId;
    if (!id) return;
    try {
        const { comments } = await api.listComments(id);
        if (artifactId === id) setComments(comments); // a switch mid-flight wins
    } catch (e) {
        reportError(e, "Couldn’t load the comments on this artifact");
    }
}

// A brand-new section exists only in the editor until autosave lands, and the server refuses a
// comment on a section id its digest has never seen, so the checkpoint has to run first.
export async function createComment(input: CommentCreateBody): Promise<CommentDto | null> {
    const id = artifactId;
    if (!id) return null;
    try {
        await flushAutosave();
        const { comment } = await api.createComment(id, input);
        await refreshComments();
        return comment;
    } catch (e) {
        reportError(e, "Couldn’t post that comment");
        return null;
    }
}

export async function replyToComment(root: CommentDto, body: string): Promise<void> {
    await createComment({
        body,
        sectionId: root.sectionId,
        anchor: root.anchor,
        parentId: root.id,
    });
}

export async function editComment(id: string, body: string): Promise<void> {
    try {
        await api.editComment(id, body);
        await refreshComments();
    } catch (e) {
        reportError(e, "Couldn’t save that edit");
    }
}

export async function resolveComment(id: string, resolved: boolean): Promise<void> {
    try {
        await api.resolveComment(id, resolved);
        await refreshComments();
    } catch (e) {
        reportError(e, resolved ? "Couldn’t resolve that thread" : "Couldn’t reopen that thread");
    }
}

export async function deleteComment(id: string): Promise<void> {
    try {
        await api.deleteComment(id);
        await refreshComments();
    } catch (e) {
        reportError(e, "Couldn’t delete that comment");
    }
}

// Polling, gated on visibility so a backgrounded tab costs nothing; a hidden-to-visible flip
// refetches at once rather than waiting out the interval.
const onVisibility = (): void => {
    if (document.visibilityState === "visible") void refreshComments();
};

function startSync(): void {
    if (timer) return;
    timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void refreshComments();
    }, POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
}

function stopSync(): void {
    if (!timer) return;
    window.clearInterval(timer);
    timer = 0;
    document.removeEventListener("visibilitychange", onVisibility);
}
