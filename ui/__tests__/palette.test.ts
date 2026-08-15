import { beforeEach, describe, expect, it } from "vitest";
import {
    _resetPaletteSources,
    listPaletteSources,
    paletteDisplay,
    registerPaletteSource,
    snippetRuns,
    type Bucket,
    type DisplayOpts,
    type Row,
} from "@ui/palette-model";
import { slashAlias, type KeyCtx } from "@ui/keys";

const row = (id: string, title: string, group: Row["group"], slash?: string): Row => ({
    id,
    title,
    group,
    slash,
});

const rows: Row[] = [
    row("edit.undo", "Undo", "edit", "/undo"),
    row("edit.redo", "Redo", "edit", "/redo"),
    row("nav.library", "Go to library", "navigate", "/library"),
    row("present.start", "Present", "present", "/present"),
];

const ctx: KeyCtx = { has: () => false, scope: null, scopes: [], inputFocused: false };

const bucket = (id: string, order: number, ...titles: string[]): Bucket => ({
    section: { id, label: id[0]!.toUpperCase() + id.slice(1), order },
    rows: titles.map((t) => ({ id: `${id}:${t}`, title: t })),
});

const show = (over: Partial<DisplayOpts> = {}): ReturnType<typeof paletteDisplay> =>
    paletteDisplay({ commands: rows, query: "", atRoot: true, recentIds: [], ...over });

const titles = (d: ReturnType<typeof paletteDisplay>): string[] => d.map((x) => x.row.title);
const headers = (d: ReturnType<typeof paletteDisplay>): (string | undefined)[] =>
    d.filter((x) => x.header).map((x) => x.header);

describe("paletteDisplay — landing (no query)", () => {
    it("shows the sources and keeps the command catalog out of the way", () => {
        const d = show({ buckets: [bucket("artifacts", 10, "Recent deck")] });
        expect(titles(d)).toEqual(["Recent deck"]);
        expect(headers(d)).toEqual(["Artifacts"]);
    });

    it("keeps a few recently-run commands within reach", () => {
        const d = show({
            buckets: [bucket("artifacts", 10, "Recent deck")],
            recentIds: ["present.start", "edit.undo"],
        });
        expect(titles(d)).toEqual(["Recent deck", "Present", "Undo"]);
        expect(headers(d)).toEqual(["Artifacts", "Recent commands"]);
    });

    it("caps the recent list rather than growing without bound", () => {
        const d = show({ recentIds: ["edit.undo", "edit.redo", "nav.library", "present.start"] });
        expect(titles(d)).toHaveLength(3);
    });
});

describe("paletteDisplay — searching", () => {
    it("puts source buckets above commands, in section order", () => {
        const d = show({
            query: "und",
            buckets: [
                bucket("folders", 20, "Pitches"),
                bucket("artifacts", 10, "Undo report", "Underwriting"),
            ],
        });
        expect(titles(d)).toEqual(["Undo report", "Underwriting", "Pitches", "Undo"]);
        expect(headers(d)).toEqual(["Artifacts", "Folders", "Commands"]);
    });

    it("keeps source rows in the order the source returned them", () => {
        const d = paletteDisplay({
            commands: [],
            query: "q",
            atRoot: true,
            recentIds: [],
            buckets: [bucket("artifacts", 10, "zeta", "alpha")],
        });
        expect(titles(d)).toEqual(["zeta", "alpha"]);
    });

    it("skips empty buckets", () => {
        const d = show({
            query: "und",
            buckets: [
                bucket("artifacts", 10, "Undo report"),
                { section: { id: "folders", label: "Folders", order: 20 }, rows: [] },
            ],
        });
        expect(headers(d)).toEqual(["Artifacts", "Commands"]);
    });
});

describe("paletteDisplay — command mode", () => {
    it("browses the whole catalog, grouped, when the slash stands alone", () => {
        const d = show({ commandMode: true });
        expect(headers(d)).toEqual(["Navigate", "Edit", "Present"]);
        expect(titles(d)).toEqual(["Go to library", "Undo", "Redo", "Present"]);
    });

    it("floats recently-run commands above the groups", () => {
        const d = show({ commandMode: true, recentIds: ["present.start"] });
        expect(d[0]!.header).toBe("Recent");
        expect(d[0]!.row.id).toBe("present.start");
    });

    it("ranks flat once the term is not empty", () => {
        const d = show({ commandMode: true, query: "und" });
        expect(d[0]!.header).toBe("Commands");
        expect(d[0]!.row.id).toBe("edit.undo");
        expect(d.slice(1).every((x) => x.header === undefined)).toBe(true);
    });

    it("matches the slash alias, not just the title", () => {
        const d = show({ commandMode: true, query: "lib" });
        expect(d[0]!.row.id).toBe("nav.library");
    });

    it("ignores the sources entirely", () => {
        const d = show({ commandMode: true, buckets: [bucket("artifacts", 10, "A deck")] });
        expect(titles(d)).not.toContain("A deck");
    });
});

describe("paletteDisplay — sub-lists", () => {
    it("never groups below the root level", () => {
        const d = show({ atRoot: false });
        expect(d.every((x) => x.header === undefined)).toBe(true);
        expect(d.map((x) => x.row.id)).toEqual(rows.map((r) => r.id));
    });

    it("drops buckets below the root level", () => {
        const d = show({ atRoot: false, buckets: [bucket("artifacts", 10, "nope")] });
        expect(titles(d)).not.toContain("nope");
    });
});

describe("slashAlias", () => {
    it("derives from the id's last segment, kebab-cased", () => {
        expect(slashAlias({ id: "nav.library" })).toBe("/library");
        expect(slashAlias({ id: "doc.newViaAi" })).toBe("/new-via-ai");
        expect(slashAlias({ id: "arrange.moveSectionUp" })).toBe("/move-section-up");
    });

    it("takes an explicit alias, with or without the slash", () => {
        expect(slashAlias({ id: "share.open", slash: "/share" })).toBe("/share");
        expect(slashAlias({ id: "theme.open", slash: "theme" })).toBe("/theme");
    });
});

describe("palette sources", () => {
    beforeEach(() => _resetPaletteSources());

    it("registers by id, last write wins", () => {
        const section = { id: "artifacts", label: "Artifacts", order: 10 };
        registerPaletteSource({ id: "artifacts", section, local: () => [] });
        registerPaletteSource({ id: "artifacts", section, local: () => [row("a", "A", "file")] });
        expect(listPaletteSources(ctx)).toHaveLength(1);
        expect(listPaletteSources(ctx)[0]!.local?.("", ctx)).toHaveLength(1);
    });

    it("honours a source's `when` gate", () => {
        const section = { id: "artifacts", label: "Artifacts", order: 10 };
        registerPaletteSource({ id: "a", section, when: () => false });
        registerPaletteSource({ id: "b", section, when: () => true });
        expect(listPaletteSources(ctx).map((s) => s.id)).toEqual(["b"]);
    });
});

describe("snippetRuns", () => {
    it("splits a snippet into plain and highlighted runs", () => {
        expect(snippetRuns({ text: "we sell freemium plans", marks: [[8, 16]] })).toEqual([
            { text: "we sell ", hit: false },
            { text: "freemium", hit: true },
            { text: " plans", hit: false },
        ]);
    });

    it("handles several marks and a mark at the very start", () => {
        expect(
            snippetRuns({
                text: "ab cd ef",
                marks: [
                    [0, 2],
                    [3, 5],
                ],
            }),
        ).toEqual([
            { text: "ab", hit: true },
            { text: " ", hit: false },
            { text: "cd", hit: true },
            { text: " ef", hit: false },
        ]);
    });

    it("ignores out-of-range or overlapping marks rather than corrupting the text", () => {
        const runs = snippetRuns({
            text: "abc",
            marks: [
                [1, 2],
                [0, 1],
                [2, 99],
            ],
        });
        expect(runs.map((r) => r.text).join("")).toBe("abc");
    });

    it("returns the whole text when nothing is marked", () => {
        expect(snippetRuns({ text: "plain", marks: [] })).toEqual([{ text: "plain", hit: false }]);
    });
});
