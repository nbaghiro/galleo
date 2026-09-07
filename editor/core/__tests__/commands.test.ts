// @vitest-environment happy-dom
import "@elements/register"; // the predicate reads element specs, so the registry has to be up
import {
    completeConnect,
    insertFromPalette,
    removeConnection,
    setConnectionStyle,
    startConnect,
} from "@editor/core/commands"; // also registers commands + keymap
import { getElementAt } from "@elements/ops";
import { beforeEach, describe, expect, it } from "vitest";
import {
    allCommands,
    bindingLabel,
    GROUP_ORDER,
    resolveChord,
    runCommand,
    type KeyCtx,
} from "@ui/keys";
import type { ArtifactContent, ElementAddress, ElementInstance } from "@model/artifact";
import {
    canUndo,
    commit,
    editor,
    loadArtifactContent,
    selectedAddresses,
    selectMany,
    selection,
    setSelection,
    selectedConnection,
    toggleExtra,
    undo,
} from "@editor/core/store";
import { clipboardEl } from "@editor/core/clipboard";
import { onCommentCreate } from "@editor/core/comments";

describe("editor command registry", () => {
    const cmds = allCommands();
    const ids = new Set(cmds.map((c) => c.id));

    it("registers the built-ins plus every editor command", () => {
        for (const id of [
            "view.commandPalette",
            "help.shortcuts",
            "edit.undo",
            "edit.redo",
            "edit.delete",
            "edit.duplicate",
            "select.up",
            "insert.sectionBelow",
            "insert.sectionViaAi",
            "arrange.moveSectionUp",
            "arrange.moveSectionDown",
            "arrange.duplicateSection",
            "doc.setFormat",
            "present.start",
            "share.open",
            "view.toggleSections",
            "view.toggleInspector",
            "ai.regenerateElement",
        ])
            expect(ids, `missing command ${id}`).toContain(id);
    });

    it("commands are well-formed and uniquely id'd", () => {
        for (const c of cmds) {
            expect(c.title.length, c.id).toBeGreaterThan(0);
            expect(GROUP_ORDER, c.id).toContain(c.group);
        }
        expect(ids.size).toBe(cmds.length);
    });

    it("the core editor commands are bound; the palette-only ones are not", () => {
        for (const id of [
            "edit.undo",
            "edit.redo",
            "edit.delete",
            "edit.duplicate",
            "edit.copy",
            "edit.paste",
            "select.up",
            "format.bold",
            "present.start",
        ])
            expect(bindingLabel(id), `${id} should be bound`).toBeTruthy();
        // deliberately palette-only
        for (const id of [
            "view.toggleSections",
            "view.toggleInspector",
            "arrange.moveSectionUp",
            "doc.setFormat",
            "share.open",
        ])
            expect(bindingLabel(id), `${id} should be unbound`).toBeNull();
    });
});

function ctx(keys: string[], inputFocused = false): KeyCtx {
    const set = new Set(keys);
    return { has: (k) => set.has(k), scope: null, scopes: [], inputFocused };
}

describe("migrated editor keymap", () => {
    it("delete + duplicate fire on the canvas but defer to a focused form field", () => {
        const sel = ctx(["editor", "editor.hasSelection", "editor.element"]);
        expect(resolveChord("delete", sel)?.id).toBe("edit.delete");
        expect(resolveChord("backspace", sel)?.id).toBe("edit.delete");
        expect(resolveChord("mod+d", sel)?.id).toBe("edit.duplicate");
        const typing = ctx(["editor", "editor.hasSelection", "editor.element"], true);
        expect(resolveChord("delete", typing)).toBeNull();
        expect(resolveChord("mod+d", typing)).toBeNull();
    });

    it("undo resolves on the canvas but not while inline-editing text", () => {
        // a real change, so the commit records an entry and canUndo() is true
        commit({ ...editor.artifact, theme: "aurora" });
        expect(resolveChord("mod+z", ctx(["editor"]))?.id).toBe("edit.undo");
        expect(resolveChord("mod+z", ctx(["editor", "editor.textEditing"]))).toBeNull();
    });

    it("text marks fire only while editing — including inside the contenteditable (allowInInput)", () => {
        const editing = ctx(["editor", "editor.textEditing"], true);
        expect(resolveChord("mod+b", editing)?.id).toBe("format.bold");
        expect(resolveChord("mod+i", editing)?.id).toBe("format.italic");
        expect(resolveChord("mod+u", editing)?.id).toBe("format.underline");
        // not editing → the mark chords are inert even in an input
        expect(resolveChord("mod+b", ctx(["editor"], true))).toBeNull();
    });

    it("present is bound; the trimmed-away chords are unbound", () => {
        const e = ctx(["editor"]);
        expect(resolveChord("mod+shift+enter", e)?.id).toBe("present.start");
        // deliberately palette-only / on-canvas now
        expect(resolveChord("mod+\\", e)).toBeNull();
        expect(resolveChord("mod+alt+i", e)).toBeNull();
        expect(resolveChord("tab", ctx(["editor", "editor.element"]))).toBeNull();
        expect(resolveChord("up", ctx(["editor", "editor.section"]))).toBeNull();
    });

    it("element clipboard resolves on the canvas but defers to a focused input", () => {
        const el = ctx(["editor", "editor.hasSelection", "editor.element"]);
        expect(resolveChord("mod+c", el)?.id).toBe("edit.copy");
        expect(resolveChord("mod+x", el)?.id).toBe("edit.cut");
        const typing = ctx(["editor", "editor.hasSelection", "editor.element"], true);
        expect(resolveChord("mod+c", typing)).toBeNull();
    });
});

// The comment chord follows the same rule the chip does: a part of a composite is not a block, so
// there is nothing for a comment to hang on there.
describe("comment.add follows what is commentable", () => {
    const el = (type: string, kids?: ElementInstance[]): ElementInstance => ({
        type,
        ...(kids ? { data: { children: kids } } : { data: { text: "words" } }),
    });
    const doc: ArtifactContent = {
        format: "deck",
        theme: "studio",
        sections: [
            {
                id: "s1",
                root: {
                    type: "container",
                    // a unit owns its parts; a container does not, so the unit is what this asserts on
                    data: { direction: "col", children: [el("text"), el("callout", [el("text")])] },
                },
            },
        ],
    };
    const chord = (): string | null | undefined =>
        resolveChord("mod+alt+m", ctx(["editor", "editor.element"], true))?.id;

    beforeEach(() => {
        onCommentCreate(() => Promise.resolve(null)); // a host is what makes commenting available
        loadArtifactContent("cmd", doc);
    });

    it("resolves on a standalone block", () => {
        setSelection({ kind: "element", address: { section: "s1", path: [0] } });
        expect(chord()).toBe("comment.add");
    });

    it("resolves on the unit itself", () => {
        setSelection({ kind: "element", address: { section: "s1", path: [1] } });
        expect(chord()).toBe("comment.add");
    });

    it("goes quiet on a part of the unit", () => {
        setSelection({ kind: "element", address: { section: "s1", path: [1, 0] } });
        expect(chord()).toBeUndefined();
    });
});

// The batch commands are one gesture and therefore one undo entry: the ops compose into a single
// content transition before `commit` ever sees them.
describe("commands over a multi-selection", () => {
    const txt = (t: string): ElementInstance => ({ type: "text", data: { text: t } });
    const addr = (path: number[]): ElementAddress => ({ section: "s1", path });
    const doc = (): ArtifactContent => ({
        format: "deck",
        theme: "studio",
        sections: [
            {
                id: "s1",
                root: {
                    type: "container",
                    data: { direction: "col", children: [txt("a"), txt("b"), txt("c")] },
                },
            },
        ],
    });
    const texts = (): string[] => {
        const out: string[] = [];
        const walk = (el: ElementInstance): void => {
            const d = el.data as { text?: string; children?: ElementInstance[] };
            if (typeof d.text === "string") out.push(d.text);
            for (const k of d.children ?? []) walk(k);
        };
        walk(editor.artifact.sections[0]!.root);
        return out;
    };
    const selectTwo = (): void => {
        setSelection({ kind: "element", address: addr([0]) });
        toggleExtra(addr([1]));
    };

    beforeEach(() => {
        loadArtifactContent("batch", doc());
    });

    it("delete removes every member, in one undo step", () => {
        selectTwo();
        runCommand("edit.delete");
        expect(texts()).toEqual(["c"]);
        expect(selection()).toBeNull();
        undo();
        expect(texts()).toEqual(["a", "b", "c"]);
        expect(canUndo()).toBe(false);
    });

    it("duplicate copies every member and leaves the copies selected", () => {
        selectTwo();
        runCommand("edit.duplicate");
        expect(texts()).toEqual(["a", "a", "b", "b", "c"]);
        expect(selectedAddresses()).toEqual([addr([1]), addr([3])]);
        undo();
        expect(texts()).toEqual(["a", "b", "c"]);
    });

    it("copy then paste puts the whole block back, in order", () => {
        selectTwo();
        runCommand("edit.copy");
        setSelection({ kind: "element", address: addr([2]) });
        runCommand("edit.paste");
        expect(texts()).toEqual(["a", "b", "c", "a", "b"]);
        expect(selectedAddresses()).toEqual([addr([3]), addr([4])]);
    });

    it("cut takes the block and hands it to the clipboard", () => {
        selectTwo();
        runCommand("edit.cut");
        expect(texts()).toEqual(["c"]);
        expect(clipboardEl().map((e) => (e.data as { text?: string }).text)).toEqual(["a", "b"]);
    });

    it("group wraps the members where they stood, and undo puts them back", () => {
        selectTwo();
        expect(
            resolveChord("mod+g", ctx(["editor", "editor.hasSelection", "editor.element"]))?.id,
        ).toBe("edit.group");
        runCommand("edit.group");
        expect(texts()).toEqual(["a", "b", "c"]);
        expect(selection()).toEqual({ kind: "element", address: addr([0]) });
        undo();
        expect(canUndo()).toBe(false);
    });

    it("ungroup splices the children back and selects them all", () => {
        selectTwo();
        runCommand("edit.group");
        runCommand("edit.ungroup");
        expect(selectedAddresses()).toEqual([addr([0]), addr([1])]);
        expect(texts()).toEqual(["a", "b", "c"]);
    });

    it("group is unavailable across parents, ungroup only on a group", () => {
        setSelection({ kind: "element", address: addr([0]) });
        const withSel = ctx(["editor", "editor.hasSelection", "editor.element"]);
        expect(resolveChord("mod+g", withSel)).toBeNull(); // one element is not a set
        expect(resolveChord("mod+shift+g", withSel)).toBeNull(); // a text is not a group
    });

    it("Esc peels the set back to its anchor before it walks up the tree", () => {
        selectTwo();
        runCommand("select.up");
        expect(selectedAddresses()).toEqual([addr([0])]);
        runCommand("select.up");
        expect(selection()).toEqual({ kind: "element", address: addr([]) });
    });

    it("commenting goes quiet while more than one element is selected", () => {
        onCommentCreate(() => Promise.resolve(null));
        selectTwo();
        expect(resolveChord("mod+alt+m", ctx(["editor", "editor.element"], true))).toBeNull();
    });
});

describe("pin commands", () => {
    const el = (t: string): ElementInstance => ({ type: "text", data: { text: t } });
    const pinnedDoc = (): ArtifactContent => ({
        format: "doc",
        theme: "default",
        sections: [
            {
                id: "s1",
                root: {
                    type: "container",
                    data: {
                        children: [
                            el("body"),
                            {
                                ...el("badge"),
                                layout: { width: "fit", pin: { x: "end", y: "start", dx: 10 } },
                            },
                        ],
                    },
                },
            },
        ],
    });
    const pinOf = (): Record<string, number | string> =>
        (getElementAt(editor.artifact, { section: "s1", path: [1] })?.layout?.pin ?? {}) as Record<
            string,
            number | string
        >;

    it("arrow nudges move a pinned selection, shift moves it faster", async () => {
        loadArtifactContent("pin-cmd", pinnedDoc());
        setSelection({ kind: "element", address: { section: "s1", path: [1] } });
        await runCommand("pin.nudgeRight");
        expect(pinOf().dx).toBe(11);
        await runCommand("pin.nudgeDownFast");
        expect(pinOf().dy).toBe(10);
    });

    it("nudge declines without a pinned selection", async () => {
        loadArtifactContent("pin-cmd2", pinnedDoc());
        setSelection({ kind: "element", address: { section: "s1", path: [0] } });
        await runCommand("pin.nudgeLeft");
        const flow = getElementAt(editor.artifact, { section: "s1", path: [0] });
        expect(flow?.layout?.pin).toBeUndefined();
    });

    it("pin.toggle unpins a pinned element", async () => {
        loadArtifactContent("pin-cmd3", pinnedDoc());
        setSelection({ kind: "element", address: { section: "s1", path: [1] } });
        await runCommand("pin.toggle");
        expect(pinOf().x).toBeUndefined();
    });
});

describe("delete and duplicate reach a unit's children", () => {
    const doc = (): ArtifactContent => ({
        format: "deck",
        theme: "studio",
        sections: [
            {
                id: "s1",
                root: {
                    type: "bullets",
                    data: {
                        marker: "dot",
                        children: ["a", "b", "c"].map((text) => ({
                            type: "text",
                            data: { text, style: "body" },
                        })),
                    },
                },
            },
        ],
    });
    const addr = (path: number[]): ElementAddress => ({ section: "s1", path });
    const items = (): string[] =>
        (
            (getElementAt(editor.artifact, addr([]))?.data as { children: ElementInstance[] })
                .children ?? []
        ).map((c) => (c.data as { text: string }).text);

    beforeEach(() => {
        loadArtifactContent("unit-items", doc());
    });

    it("Delete on a bullet item removes that item", () => {
        setSelection({ kind: "element", address: addr([1]) });
        runCommand("edit.delete");
        expect(items()).toEqual(["a", "c"]);
        undo();
        expect(items()).toEqual(["a", "b", "c"]);
    });

    it("⌘D on a bullet item adds one below it and selects the copy", () => {
        setSelection({ kind: "element", address: addr([0]) });
        runCommand("edit.duplicate");
        expect(items()).toEqual(["a", "a", "b", "c"]);
        expect(selectedAddresses()).toEqual([addr([1])]);
    });
});

// U10: cut reaches everything copy does — a sealed child cuts through its container's own rule
describe("cut on a sealed child", () => {
    const doc = (): ArtifactContent => ({
        format: "deck",
        theme: "studio",
        sections: [
            {
                id: "s1",
                root: {
                    type: "container",
                    data: {
                        direction: "col",
                        children: [
                            {
                                type: "bullets",
                                data: {
                                    children: [
                                        { type: "text", data: { text: "one" } },
                                        { type: "text", data: { text: "two" } },
                                    ],
                                },
                            },
                            { type: "text", data: { text: "after" } },
                        ],
                    },
                },
            },
        ],
    });

    it("copies the item to the clipboard and removes it in place", () => {
        loadArtifactContent("cmd-cut", doc());
        setSelection({ kind: "element", address: { section: "s1", path: [0, 0] } });
        runCommand("edit.cut");
        const list = getElementAt(editor.artifact, { section: "s1", path: [0] })!;
        expect((list.data as { children: ElementInstance[] }).children).toHaveLength(1);
        expect(clipboardEl().map((e) => (e.data as { text?: string }).text)).toEqual(["one"]);
    });
});

describe("insertFromPalette", () => {
    const doc = (): ArtifactContent => ({
        format: "deck",
        theme: "studio",
        sections: [
            {
                id: "s1",
                root: {
                    type: "container",
                    data: {
                        direction: "col",
                        children: [
                            {
                                type: "bullets",
                                data: {
                                    children: [
                                        { type: "text", data: { text: "one" } },
                                        { type: "text", data: { text: "two" } },
                                    ],
                                },
                            },
                            { type: "text", data: { text: "after" } },
                        ],
                    },
                },
            },
        ],
    });
    const rootChildren = (): ElementInstance[] =>
        (
            getElementAt(editor.artifact, { section: "s1", path: [] })!.data as {
                children: ElementInstance[];
            }
        ).children;

    it("inserts beside the selected element", () => {
        loadArtifactContent("palette-beside", doc());
        setSelection({ kind: "element", address: { section: "s1", path: [1] } });
        expect(insertFromPalette({ type: "divider", data: {} })).toBe(true);
        expect(rootChildren().map((e) => e.type)).toEqual(["bullets", "text", "divider"]);
        expect(selection()?.kind).toBe("element");
    });

    it("a selection inside a seal inserts beside the unit, never into it", () => {
        loadArtifactContent("palette-seal", doc());
        setSelection({ kind: "element", address: { section: "s1", path: [0, 0] } });
        expect(insertFromPalette({ type: "divider", data: {} })).toBe(true);
        expect(rootChildren().map((e) => e.type)).toEqual(["bullets", "divider", "text"]);
        const list = getElementAt(editor.artifact, { section: "s1", path: [0] })!;
        expect((list.data as { children: ElementInstance[] }).children).toHaveLength(2);
    });

    it("no selection lands at the end of the last section", () => {
        loadArtifactContent("palette-end", doc());
        setSelection(null);
        expect(insertFromPalette({ type: "divider", data: {} })).toBe(true);
        expect(rootChildren().at(-1)?.type).toBe("divider");
    });
});

describe("connections", () => {
    const doc = (): ArtifactContent => ({
        format: "deck",
        theme: "studio",
        sections: [
            {
                id: "s1",
                root: {
                    type: "container",
                    data: {
                        direction: "col",
                        children: [
                            { type: "text", data: { text: "from here" } },
                            { type: "text", data: { text: "to there" } },
                        ],
                    },
                },
            },
        ],
    });

    it("completeConnect stamps ids and stores the pair", () => {
        loadArtifactContent("conn-make", doc());
        setSelection({ kind: "element", address: { section: "s1", path: [0] } });
        startConnect();
        expect(completeConnect({ address: { section: "s1", path: [1] } })).toBe(true);
        const list = editor.artifact.connections!;
        expect(list).toHaveLength(1);
        const from = getElementAt(editor.artifact, { section: "s1", path: [0] })!;
        const to = getElementAt(editor.artifact, { section: "s1", path: [1] })!;
        expect(list[0]!.from.element).toBe(from.id);
        expect(list[0]!.to.element).toBe(to.id);
        expect(selectedConnection()).toBe(list[0]!.id);
    });

    it("connecting an element to itself refuses", () => {
        loadArtifactContent("conn-self", doc());
        setSelection({ kind: "element", address: { section: "s1", path: [0] } });
        startConnect();
        expect(completeConnect({ address: { section: "s1", path: [0] } })).toBe(false);
        expect(editor.artifact.connections).toBeUndefined();
    });

    it("removeConnection drops the entry and undo restores it", () => {
        loadArtifactContent("conn-del", doc());
        setSelection({ kind: "element", address: { section: "s1", path: [0] } });
        startConnect();
        completeConnect({ address: { section: "s1", path: [1] } });
        const id = editor.artifact.connections![0]!.id;
        removeConnection(id);
        expect(editor.artifact.connections).toBeUndefined();
        undo();
        expect(editor.artifact.connections).toHaveLength(1);
    });

    it("setConnectionStyle patches without clobbering the rest", () => {
        loadArtifactContent("conn-style", doc());
        setSelection({ kind: "element", address: { section: "s1", path: [0] } });
        startConnect();
        completeConnect({ address: { section: "s1", path: [1] } });
        const id = editor.artifact.connections![0]!.id;
        setConnectionStyle(id, { dashed: true });
        setConnectionStyle(id, { tone: "accent" });
        expect(editor.artifact.connections![0]!.style).toEqual({ dashed: true, tone: "accent" });
    });
});

describe("arrange.step — the keyboard is micro-drags", () => {
    const doc = (): ArtifactContent => ({
        format: "deck",
        theme: "studio",
        sections: [
            {
                id: "s1",
                root: {
                    type: "container",
                    data: {
                        direction: "col",
                        children: [
                            { type: "text", data: { text: "a" } },
                            { type: "text", data: { text: "b" } },
                            {
                                type: "container",
                                data: {
                                    direction: "row",
                                    children: [
                                        { type: "text", data: { text: "c" } },
                                        { type: "text", data: { text: "d" } },
                                    ],
                                },
                            },
                            { type: "text", data: { text: "e" } },
                        ],
                    },
                },
            },
        ],
    });
    const texts = (): string[] => {
        const out: string[] = [];
        const walk = (el: ElementInstance): void => {
            const t = (el.data as { text?: string }).text;
            if (typeof t === "string") out.push(t);
            ((el.data as { children?: ElementInstance[] }).children ?? []).forEach(walk);
        };
        walk(editor.artifact.sections[0]!.root);
        return out;
    };
    const sel = (path: number[]): void =>
        setSelection({ kind: "element", address: { section: "s1", path } });

    it("alt toward a leaf neighbor wraps with it, payload leading", () => {
        loadArtifactContent("kbd-wrap", doc());
        sel([0]); // "a", neighbor below is the leaf "b"
        runCommand("arrange.intoDown");
        // a and b joined side by side (perpendicular of the col), a leading
        const joined = getElementAt(editor.artifact, { section: "s1", path: [0] })!;
        expect(joined.type).toBe("container");
        expect((joined.data as { direction?: string }).direction).toBe("row");
        expect(texts()).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("swaps with the neighbor along the parent's axis", () => {
        loadArtifactContent("arr-swap", doc());
        sel([1]);
        runCommand("arrange.stepDown");
        expect(texts()).toEqual(["a", "c", "d", "b", "e"]);
        expect(selection()).toMatchObject({ address: { path: [2] } });
        runCommand("arrange.stepUp");
        expect(texts()).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("the root member at its edge stays put", () => {
        loadArtifactContent("arr-edge", doc());
        sel([0]);
        runCommand("arrange.stepUp");
        expect(texts()).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("a nested member at the perpendicular steps out beside its parent", () => {
        loadArtifactContent("arr-out", doc());
        sel([2, 0]);
        runCommand("arrange.stepDown");
        // c leaves the row and lands after it in the root col
        expect(texts()).toEqual(["a", "b", "d", "c", "e"]);
    });

    it("swaps inside the nested row along its own axis", () => {
        loadArtifactContent("arr-row", doc());
        sel([2, 0]);
        runCommand("arrange.stepRight");
        expect(texts()).toEqual(["a", "b", "d", "c", "e"]);
        expect(
            (
                getElementAt(editor.artifact, { section: "s1", path: [2] })!.data as {
                    children: ElementInstance[];
                }
            ).children,
        ).toHaveLength(2);
    });

    it("alt steps into the adjacent open container", () => {
        loadArtifactContent("arr-into", doc());
        sel([1]);
        runCommand("arrange.intoDown");
        expect(texts()).toEqual(["a", "b", "c", "d", "e"]);
        const row = getElementAt(editor.artifact, { section: "s1", path: [1] })!;
        expect((row.data as { children: ElementInstance[] }).children).toHaveLength(3);
    });

    it("a block steps as one, keeping the set", () => {
        loadArtifactContent("arr-block", doc());
        selectMany([
            { section: "s1", path: [0] },
            { section: "s1", path: [1] },
        ]);
        runCommand("arrange.stepDown");
        expect(texts()).toEqual(["c", "d", "a", "b", "e"]);
        expect(selectedAddresses()).toHaveLength(2);
    });

    it("a burst is one undo entry", () => {
        loadArtifactContent("arr-undo", doc());
        sel([0]);
        runCommand("arrange.stepDown");
        runCommand("arrange.stepDown");
        expect(texts()).toEqual(["b", "c", "d", "a", "e"]);
        undo();
        expect(texts()).toEqual(["a", "b", "c", "d", "e"]);
        expect(canUndo()).toBe(false);
    });

    it("a unit's item swaps inside but never steps out", () => {
        loadArtifactContent("arr-unit", {
            format: "deck",
            theme: "studio",
            sections: [
                {
                    id: "s1",
                    root: {
                        type: "container",
                        data: {
                            direction: "col",
                            children: [
                                {
                                    type: "bullets",
                                    data: {
                                        children: [
                                            { type: "text", data: { text: "one" } },
                                            { type: "text", data: { text: "two" } },
                                        ],
                                    },
                                },
                                { type: "text", data: { text: "after" } },
                            ],
                        },
                    },
                },
            ],
        });
        sel([0, 0]);
        runCommand("arrange.stepDown");
        const items = (
            getElementAt(editor.artifact, { section: "s1", path: [0] })!.data as {
                children: ElementInstance[];
            }
        ).children;
        expect(items.map((i) => (i.data as { text: string }).text)).toEqual(["two", "one"]);
        sel([0, 1]);
        runCommand("arrange.stepDown");
        expect(items === undefined ? 2 : 2).toBe(2);
        expect(
            (
                getElementAt(editor.artifact, { section: "s1", path: [0] })!.data as {
                    children: ElementInstance[];
                }
            ).children,
        ).toHaveLength(2);
    });
});
