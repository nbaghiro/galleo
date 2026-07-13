import "../commands"; // side-effect: register editor commands
import { describe, expect, it } from "vitest";
import { allCommands, bindingLabel, GROUP_ORDER } from "@ui/keys";

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
