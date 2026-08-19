// @vitest-environment happy-dom
import "@elements/register";
import { beforeEach, describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { contentWithElementIds } from "@model/artifact";
import type { CommentDto, CommentThread } from "@model/comments";
import { editor, loadArtifactContent, startEditing, stopEditing } from "@editor/core/store";
import {
    applyCommentMark,
    captureAnchor,
    commentableAt,
    commentMarkRanges,
    threadAddress,
} from "@editor/core/comments";

// A comment is only as good as the id it anchors to. These pin the round trip: an anchor captured
// against what is on screen has to still resolve after the tree makes a lap through the server,
// which is what a reload replays. The server stamps element ids on write and on a read that finds
// none, so the tree the client anchors against is the tree that comes back.

const text = (value: string): ElementInstance => ({ type: "text", data: { text: value } });

const doc = (): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            root: {
                type: "group",
                data: {
                    direction: "col",
                    children: [text("The second album, twelve tracks"), text("Second body line")],
                },
            },
        },
    ],
});

// what the server holds and hands back: identity-preserving stamping, the same pass contentWrite runs
const stored = (): ArtifactContent => contentWithElementIds(doc());

const threadOf = (dto: Partial<CommentDto> & Pick<CommentDto, "anchor" | "sectionId">) => {
    const root: CommentDto = {
        id: "c-1",
        parentId: null,
        quote: "The second album",
        body: "A note",
        resolvedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        author: null,
        mine: true,
        canDelete: true,
        ...dto,
    };
    return { root, replies: [] } satisfies CommentThread;
};

const inRoot = (body: () => void): void =>
    createRoot((dispose) => {
        body();
        dispose();
    });

const reload = (): void => loadArtifactContent("a", editor.artifact);

beforeEach(() => {
    loadArtifactContent("a", stored());
});

describe("an element anchor", () => {
    it("resolves the moment it is captured", () => {
        inRoot(() => {
            const draft = captureAnchor({ section: "s1", path: [0] });
            expect(draft).not.toBeNull();
            const thread = threadOf({ sectionId: "s1", anchor: draft!.anchor });
            expect(threadAddress(thread)).toEqual({ section: "s1", path: [0] });
        });
    });

    it("still resolves after the tree makes a lap through the server", () => {
        inRoot(() => {
            const draft = captureAnchor({ section: "s1", path: [0] })!;
            const thread = threadOf({ sectionId: "s1", anchor: draft.anchor });
            // the server stores what it was sent and hands the same ids back
            loadArtifactContent("a", contentWithElementIds(editor.artifact));
            expect(threadAddress(thread)).toEqual({ section: "s1", path: [0] });
        });
    });

    it("anchors to the id already on the element rather than minting a second one", () => {
        inRoot(() => {
            const before = editor.artifact;
            const draft = captureAnchor({ section: "s1", path: [1] })!;
            expect(editor.artifact).toBe(before); // nothing was written to get an id
            const kids = (before.sections[0]!.root.data as { children: ElementInstance[] })
                .children;
            expect(draft.anchor.elementId).toBe(kids[1]!.id);
        });
    });

    // The bug this suite exists for: ids the client mints are that tab's only, so a reload re-mints
    // and the anchor points at nothing. The server stamping on read is what keeps this from happening.
    it("orphans when the tree it was captured against carried no ids", () => {
        inRoot(() => {
            loadArtifactContent("a", doc()); // unstamped, as a row written before ids would arrive
            const draft = captureAnchor({ section: "s1", path: [0] })!;
            const thread = threadOf({ sectionId: "s1", anchor: draft.anchor });
            expect(threadAddress(thread)).toBeDefined(); // fine in this tab
            loadArtifactContent("a", doc()); // the next read mints a different set
            expect(threadAddress(thread)).toBeUndefined();
        });
    });
});

describe("a text-range anchor", () => {
    const capture = (): { anchor: CommentDto["anchor"]; thread: CommentThread } => {
        startEditing({ section: "s1", path: [0] });
        const draft = captureAnchor({ section: "s1", path: [0] }, { from: 4, to: 10 })!;
        expect(draft.anchor.kind).toBe("text");
        const thread = threadOf({ sectionId: "s1", anchor: draft.anchor });
        stopEditing();
        applyCommentMark(draft, thread.root.id);
        return { anchor: draft.anchor, thread };
    };

    it("resolves to its element and its range as soon as the mark is written", () => {
        inRoot(() => {
            const { thread } = capture();
            expect(threadAddress(thread)).toEqual({ section: "s1", path: [0] });
            expect(commentMarkRanges(thread)).toEqual([{ from: 4, to: 10 }]);
        });
    });

    it("keeps both after the tree makes a lap through the server", () => {
        inRoot(() => {
            const { thread } = capture();
            reload();
            expect(threadAddress(thread)).toEqual({ section: "s1", path: [0] });
            expect(commentMarkRanges(thread)).toEqual([{ from: 4, to: 10 }]);
        });
    });

    it("keeps the mark's value tied to the thread it was written for", () => {
        inRoot(() => {
            const { thread } = capture();
            const other = threadOf({ sectionId: "s1", anchor: thread.root.anchor });
            other.root.id = "c-other";
            expect(commentMarkRanges(other)).toEqual([]);
        });
    });
});

// A comment hangs on a block. A part of a composite is not one: the chip floats over a cell too
// small to hold it and covers the very content it points at, and the thread people want is on the
// card anyway. The layout group is exempt, since columns hold blocks without owning them.
describe("commentableAt", () => {
    const el = (type: string, kids?: ElementInstance[]): ElementInstance => ({
        type,
        ...(kids ? { data: { children: kids } } : { data: { text: "words" } }),
    });

    const composite: ArtifactContent = {
        format: "deck",
        theme: "studio",
        sections: [
            {
                id: "s1",
                root: {
                    type: "group",
                    data: {
                        direction: "col",
                        children: [
                            el("text"), // [0]
                            el("group", [el("text")]), // [1]
                            el("card", [el("text")]), // [2]
                            el("group", [el("card", [el("text")])]), // [3]
                            el("bullets", [el("text")]), // [4]
                        ],
                    },
                },
            },
        ],
    };
    const at = (...path: number[]) => commentableAt(composite, { section: "s1", path });

    it("takes plain text sitting in a column", () => {
        expect(at(0)).toBe(true);
    });

    it("takes text a group wraps, since a group owns nothing", () => {
        expect(at(1, 0)).toBe(true);
    });

    it("refuses a part of a card", () => {
        expect(at(2, 0)).toBe(false);
    });

    it("refuses a card's part however many columns are above it", () => {
        expect(at(3, 0, 0)).toBe(false);
    });

    it("refuses a part of any container that is not a layout group", () => {
        expect(at(4, 0)).toBe(false);
    });

    it("takes the composite itself, which is the block the comment belongs to", () => {
        expect(at(2)).toBe(true);
        expect(at(4)).toBe(true);
    });

    it("takes the section root", () => {
        expect(at()).toBe(true);
    });

    it("refuses an address the document does not have", () => {
        expect(at(9)).toBe(false);
        expect(commentableAt(composite, { section: "gone", path: [0] })).toBe(false);
    });
});

// Creation is what the rule gates. A thread already written against a nested part points at content
// that has not gone anywhere, so it keeps resolving and keeps its marker.
describe("a thread already anchored inside a composite", () => {
    it("still resolves, even though nothing there could be commented on now", () => {
        const card: ArtifactContent = {
            format: "deck",
            theme: "studio",
            sections: [
                {
                    id: "s1",
                    root: {
                        type: "group",
                        data: {
                            direction: "col",
                            children: [
                                {
                                    type: "card",
                                    data: {
                                        children: [{ type: "text", data: { text: "inside" } }],
                                    },
                                },
                            ],
                        },
                    },
                },
            ],
        };
        loadArtifactContent("a", contentWithElementIds(card));
        const kids = (editor.artifact.sections[0]!.root.data as { children: ElementInstance[] })
            .children;
        const nested = (kids[0]!.data as { children: ElementInstance[] }).children[0]!;
        const thread = threadOf({
            sectionId: "s1",
            anchor: { kind: "element", elementId: nested.id! },
        });
        expect(commentableAt(editor.artifact, { section: "s1", path: [0, 0] })).toBe(false);
        expect(threadAddress(thread)).toEqual({ section: "s1", path: [0, 0] });
    });
});
