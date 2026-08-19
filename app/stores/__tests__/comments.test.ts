// @vitest-environment happy-dom
import "@elements/register";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import type { ArtifactContent, Section } from "@model/artifact";
import { emptyRegion } from "@model/artifact";
import type { CommentDto } from "@model/comments";
import { sectionOf } from "@canvas/testkit";
import { commit, editor, loadArtifactContent } from "@editor/core/store";
import { comments as loaded, setComments } from "@editor/core/comments";
import { installAutosave } from "@app/stores/save";
import { appError, dismissError } from "@app/stores/errors";
import {
    closeComments,
    createComment,
    deleteComment,
    editComment,
    openComments,
    refreshComments,
    replyToComment,
    resolveComment,
} from "@app/stores/comments";

const sec = (id: string): Section => sectionOf(emptyRegion(), { id });
const doc: ArtifactContent = { format: "deck", theme: "studio", sections: [sec("s1")] };

const dto = (over: Partial<CommentDto> = {}): CommentDto => ({
    id: "c-1",
    parentId: null,
    sectionId: "s1",
    anchor: { kind: "element", elementId: "e-1" },
    quote: null,
    body: "Looks off",
    resolvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    author: null,
    mine: true,
    canDelete: true,
    ...over,
});

interface Call {
    url: string;
    method: string;
    body: Record<string, unknown>;
}

let calls: Call[] = [];
let failNext = false;
let stored: CommentDto[] = [];

function stubFetch(): void {
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init?: RequestInit) => {
            calls.push({
                url,
                method: init?.method ?? "GET",
                body: JSON.parse((init?.body as string) ?? "{}") as Record<string, unknown>,
            });
            if (failNext) {
                failNext = false;
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    statusText: "Server Error",
                    text: async () => JSON.stringify({ error: "boom" }),
                });
            }
            const payload = url.endsWith("/comments")
                ? init?.method === "POST"
                    ? { comment: dto() }
                    : { comments: stored }
                : { ok: true, updatedAt: "now", total: 1, comment: dto() };
            return Promise.resolve({
                ok: true,
                status: 200,
                statusText: "OK",
                text: async () => JSON.stringify(payload),
            });
        }),
    );
}

const commentCalls = (): Call[] => calls.filter((c) => c.url.includes("comment"));

let dispose: (() => void) | null = null;

beforeEach(() => {
    calls = [];
    failNext = false;
    stored = [];
    stubFetch();
    loadArtifactContent("doc-1", doc);
    setComments([]);
    dismissError();
});

afterEach(() => {
    closeComments();
    dispose?.();
    dispose = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("the comment store", () => {
    it("loads the artifact's comments into the editor seam on open", async () => {
        stored = [dto(), dto({ id: "c-2", parentId: "c-1" })];
        openComments("doc-1");
        await vi.waitFor(() => expect(loaded()).toHaveLength(2));
        expect(commentCalls()[0]!.url).toBe("/api/artifacts/doc-1/comments");
    });

    it("refetches after every mutation, so the list is never a local guess", async () => {
        openComments("doc-1");
        await vi.waitFor(() => expect(commentCalls()).toHaveLength(1));

        await editComment("c-1", "Reworded");
        await resolveComment("c-1", true);
        await deleteComment("c-1");

        expect(commentCalls().map((c) => `${c.method} ${c.url}`)).toEqual([
            "GET /api/artifacts/doc-1/comments",
            "PATCH /api/comments/c-1",
            "GET /api/artifacts/doc-1/comments",
            "POST /api/comments/c-1/resolve",
            "GET /api/artifacts/doc-1/comments",
            "DELETE /api/comments/c-1",
            "GET /api/artifacts/doc-1/comments",
        ]);
    });

    it("checkpoints the document before creating, so the section exists server-side", async () => {
        createRoot((d) => {
            dispose = d;
            installAutosave();
        });
        openComments("doc-1");
        await vi.waitFor(() => expect(commentCalls()).toHaveLength(1));
        calls = [];
        commit({ ...editor.artifact, sections: [sec("s1")] });

        await createComment({
            body: "New",
            sectionId: "s1",
            anchor: { kind: "element", elementId: "e-1" },
        });

        const kinds = calls.map((c) => `${c.method} ${c.url}`);
        expect(kinds[0]).toBe("PATCH /api/artifacts/doc-1/content");
        expect(kinds[1]).toBe("POST /api/artifacts/doc-1/comments");
    });

    it("sends a reply against its root's own section and anchor", async () => {
        openComments("doc-1");
        await vi.waitFor(() => expect(commentCalls()).toHaveLength(1));
        calls = [];
        await replyToComment(
            dto({ id: "root-1", sectionId: "s9", anchor: { kind: "element", elementId: "e-1" } }),
            "Agreed",
        );
        const posted = calls.find((c) => c.method === "POST")!;
        expect(posted.body).toEqual({
            body: "Agreed",
            sectionId: "s9",
            anchor: { kind: "element", elementId: "e-1" },
            parentId: "root-1",
        });
    });

    it("refetches when the tab comes back into view", async () => {
        openComments("doc-1");
        await vi.waitFor(() => expect(commentCalls()).toHaveLength(1));
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.waitFor(() => expect(commentCalls()).toHaveLength(2));
    });

    it("stops listening once the artifact is closed", async () => {
        openComments("doc-1");
        await vi.waitFor(() => expect(commentCalls()).toHaveLength(1));
        closeComments();
        document.dispatchEvent(new Event("visibilitychange"));
        expect(commentCalls()).toHaveLength(1);
        expect(loaded()).toEqual([]);
    });

    it("reports a failed refresh and keeps what is already on screen", async () => {
        stored = [dto()];
        openComments("doc-1");
        await vi.waitFor(() => expect(loaded()).toHaveLength(1));
        failNext = true;
        await refreshComments();
        expect(appError()?.title).toBe("Couldn’t load the comments on this artifact");
        expect(loaded()).toHaveLength(1);
    });

    it("reports a failed write and keeps the thread list untouched", async () => {
        openComments("doc-1");
        await vi.waitFor(() => expect(commentCalls()).toHaveLength(1));
        failNext = true;
        await editComment("c-1", "Reworded");
        expect(appError()?.title).toBe("Couldn’t save that edit");
    });
});
