// @vitest-environment happy-dom
import "@elements/register"; // the predicate reads element specs, so the registry has to be up
import "@editor/core/commands"; // side-effect: register editor commands + keymap
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
    selection,
    setSelection,
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
