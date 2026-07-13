import { describe, expect, it } from "vitest";
import { paletteDisplay, type Row } from "../palette-model";

const row = (id: string, title: string, group: Row["group"]): Row => ({ id, title, group });

const rows: Row[] = [
    row("edit.undo", "Undo", "edit"),
    row("edit.redo", "Redo", "edit"),
    row("nav.library", "Go to library", "navigate"),
    row("present.start", "Present", "present"),
];

describe("paletteDisplay", () => {
    it("groups by CommandGroup at the root with an empty query", () => {
        const d = paletteDisplay(rows, "", true, []);
        const headers = d.filter((x) => x.header).map((x) => x.header);
        expect(headers).toEqual(["Navigate", "Edit", "Present"]);
        expect(d.map((x) => x.row.id)).toEqual([
            "nav.library",
            "edit.undo",
            "edit.redo",
            "present.start",
        ]);
    });

    it("surfaces a Recent group first when there are recents", () => {
        const d = paletteDisplay(rows, "", true, ["present.start"]);
        expect(d[0]!.header).toBe("Recent");
        expect(d[0]!.row.id).toBe("present.start");
    });

    it("flattens to a ranked list (no headers) when searching", () => {
        const d = paletteDisplay(rows, "und", true, []);
        expect(d.every((x) => x.header === undefined)).toBe(true);
        expect(d[0]!.row.id).toBe("edit.undo");
    });

    it("never groups below the root level", () => {
        const d = paletteDisplay(rows, "", false, []);
        expect(d.every((x) => x.header === undefined)).toBe(true);
        expect(d.map((x) => x.row.id)).toEqual(rows.map((r) => r.id));
    });
});
