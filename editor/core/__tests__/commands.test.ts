import "../commands"; // side-effect: register editor commands + keymap
import { describe, expect, it } from "vitest";
import { allCommands, bindingLabel, GROUP_ORDER, resolveChord, type KeyCtx } from "@ui/keys";
import { commit, editor } from "../store";

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
        commit(editor.artifact); // push one history entry so canUndo() is true
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
