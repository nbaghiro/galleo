import { describe, expect, it } from "vitest";
import type { CommentDto } from "@model/comments";
import {
    anchorElementId,
    anchorStateOf,
    isCommentAnchor,
    isDegraded,
    isResolved,
    threadsOf,
} from "@model/comments";

const comment = (id: string, over: Partial<CommentDto> = {}): CommentDto => ({
    id,
    parentId: null,
    sectionId: "s-1",
    anchor: { kind: "element", elementId: "e-1" },
    quote: null,
    body: `body of ${id}`,
    resolvedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    author: null,
    mine: true,
    canDelete: true,
    ...over,
});

describe("isCommentAnchor", () => {
    it("accepts the two anchor shapes", () => {
        expect(isCommentAnchor({ kind: "element", elementId: "e-1" })).toBe(true);
        expect(isCommentAnchor({ kind: "text", elementId: "e-1" })).toBe(true);
    });

    it("rejects an anchor a past shape could have written", () => {
        expect(isCommentAnchor(null)).toBe(false);
        expect(isCommentAnchor("element")).toBe(false);
        expect(isCommentAnchor({ kind: "section" })).toBe(false); // the shape this replaced
        expect(isCommentAnchor({ kind: "element" })).toBe(false);
        expect(isCommentAnchor({ kind: "element", elementId: "" })).toBe(false);
        expect(isCommentAnchor({ kind: "text", elementId: 7 })).toBe(false);
    });

    it("reads the element id off either anchor", () => {
        expect(anchorElementId({ kind: "element", elementId: "e-9" })).toBe("e-9");
        expect(anchorElementId({ kind: "text", elementId: "e-9" })).toBe("e-9");
    });
});

describe("threadsOf", () => {
    it("hangs replies off their root and keeps creation order", () => {
        const threads = threadsOf([
            comment("a"),
            comment("a1", { parentId: "a" }),
            comment("b"),
            comment("a2", { parentId: "a" }),
        ]);
        expect(threads.map((t) => t.root.id)).toEqual(["a", "b"]);
        expect(threads[0]!.replies.map((r) => r.id)).toEqual(["a1", "a2"]);
        expect(threads[1]!.replies).toEqual([]);
    });

    it("drops a reply whose root is not in the list rather than inventing a thread", () => {
        const threads = threadsOf([comment("orphan-reply", { parentId: "gone" })]);
        expect(threads).toEqual([]);
    });

    it("reads resolution off the root only", () => {
        const resolved = threadsOf([
            comment("a", { resolvedAt: "2026-02-02T00:00:00.000Z" }),
            comment("a1", { parentId: "a" }),
            comment("b"),
        ]);
        expect(resolved.map(isResolved)).toEqual([true, false]);
    });
});

describe("anchorStateOf", () => {
    it("keeps the anchor it was written as while everything still resolves", () => {
        expect(
            anchorStateOf({ kind: "text", elementId: "e-1" }, { element: true, mark: true }),
        ).toBe("text");
        expect(anchorStateOf({ kind: "element", elementId: "e-1" }, { element: true })).toBe(
            "element",
        );
    });

    it("degrades a text anchor to its element once the range was edited away", () => {
        expect(
            anchorStateOf({ kind: "text", elementId: "e-1" }, { element: true, mark: false }),
        ).toBe("element");
    });

    it("orphans a thread whose element left the document", () => {
        expect(anchorStateOf({ kind: "text", elementId: "e-1" }, { element: false })).toBe(
            "orphan",
        );
        expect(anchorStateOf({ kind: "element", elementId: "e-1" }, { element: false })).toBe(
            "orphan",
        );
    });

    it("calls out only the anchors that lost their target", () => {
        expect(isDegraded("element", { kind: "element", elementId: "e-1" })).toBe(false);
        expect(isDegraded("element", { kind: "text", elementId: "e-1" })).toBe(true);
        expect(isDegraded("orphan", { kind: "element", elementId: "e-1" })).toBe(true);
    });
});
