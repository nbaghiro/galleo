import { describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import { isArtifactContent } from "@services/core/artifacts";
import { childrenRaw, sectionForms } from "@model/artifact";
import { BODY_FONTS, DISPLAY_FONTS, MONO_FONTS, resolveTheme, THEME_LIST } from "@themes";
import type { PptxDeck, PptxPara, PptxShape } from "@services/utils/pptx";
import {
    assembleRoot,
    bandColumns,
    bandRows,
    deckToContent,
    fetchSlidesPptx,
    ImportError,
    importPptx,
    nearestThemeId,
    slidesFileId,
    styleForSize,
    textBlocksOf,
    themeFromDeck,
    vendoredFace,
    layoutsToContent,
} from "@services/core/import";

const box = (
    x: number,
    y: number,
    w: number,
    h: number,
): { x: number; y: number; w: number; h: number } => ({ x, y, w, h });
const el = (tag: string): ElementInstance => ({ type: "text", data: { text: tag, style: "body" } });
const placed = (
    tag: string,
    b: ReturnType<typeof box>,
): { box: ReturnType<typeof box>; el: ElementInstance } => ({ box: b, el: el(tag) });

const tagOf = (e: ElementInstance): string => (e.data as { text: string }).text;
const childrenOf = (e: ElementInstance): ElementInstance[] =>
    (e.data as { children: ElementInstance[] }).children;

const para = (text: string, extra: Partial<PptxPara> = {}): PptxPara => ({
    runs: [{ text }],
    lvl: 0,
    ...extra,
});

describe("flow inference", () => {
    it("stacks vertically separated shapes into rows", () => {
        const rows = bandRows([
            placed("a", box(0, 0, 100, 40)),
            placed("b", box(0, 60, 100, 40)),
            placed("c", box(0, 120, 100, 40)),
        ]);
        expect(rows.map((r) => r.length)).toEqual([1, 1, 1]);
    });

    it("bands vertically overlapping shapes into one row", () => {
        const rows = bandRows([
            placed("left", box(0, 100, 300, 200)),
            placed("right", box(400, 120, 300, 300)),
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveLength(2);
    });

    it("splits a row into columns and stacks overlapping members", () => {
        const cols = bandColumns([
            placed("l1", box(0, 0, 300, 50)),
            placed("l2", box(10, 60, 280, 50)),
            placed("r", box(400, 0, 300, 110)),
        ]);
        expect(cols).toHaveLength(2);
        expect(cols[0]!.map((p) => tagOf(p.el))).toEqual(["l1", "l2"]);
        expect(cols[1]!.map((p) => tagOf(p.el))).toEqual(["r"]);
    });

    it("assembles a two-column band into a row with width shares", () => {
        const root = assembleRoot([
            placed("text", box(0, 0, 720, 300)),
            placed("image", box(800, 0, 480, 300)),
        ]);
        expect(root.type).toBe("container");
        expect((root.data as { direction: string }).direction).toBe("row");
        const kids = childrenOf(root);
        expect(kids.map(tagOf)).toEqual(["text", "image"]);
        expect(kids[0]!.layout?.width).toEqual({ pct: 60 });
        expect(kids[1]!.layout?.width).toEqual({ pct: 40 });
    });

    it("assembles title-above-columns as a column of rows", () => {
        const root = assembleRoot([
            placed("title", box(0, 0, 1000, 80)),
            placed("left", box(0, 150, 480, 300)),
            placed("right", box(520, 150, 480, 300)),
        ]);
        expect((root.data as { direction?: string }).direction).not.toBe("row");
        const kids = childrenOf(root);
        expect(kids).toHaveLength(2);
        expect(tagOf(kids[0]!)).toBe("title");
        expect(childrenOf(kids[1]!).map(tagOf)).toEqual(["left", "right"]);
    });

    it("returns an empty region for an empty slide", () => {
        const root = assembleRoot([]);
        expect(root.type).toBe("container");
        expect(childrenOf(root)).toEqual([]);
    });
});

describe("text mapping", () => {
    it("buckets run sizes onto the type ramp", () => {
        expect(styleForSize(56, "body")).toBe("h1");
        expect(styleForSize(30, "body")).toBe("h2");
        expect(styleForSize(22, "body")).toBe("h3");
        expect(styleForSize(17, "body")).toBe("body");
        expect(styleForSize(11, "body")).toBe("caption");
        expect(styleForSize(undefined, "h2")).toBe("h2");
    });

    it("maps title roles to headings", () => {
        expect(textBlocksOf([para("Big")], "ctrTitle")[0]!.data).toMatchObject({ style: "h1" });
        expect(textBlocksOf([para("Head")], "title")[0]!.data).toMatchObject({ style: "h2" });
        expect(textBlocksOf([para("Sub")], "subTitle")[0]!.data).toMatchObject({
            style: "subtitle",
        });
    });

    it("groups explicit bullet paragraphs into a bullets element", () => {
        const blocks = textBlocksOf(
            [
                para("Intro", { bullet: false }),
                para("One", { bullet: true }),
                para("Two", { bullet: true }),
            ],
            undefined,
        );
        expect(blocks).toHaveLength(2);
        expect(blocks[0]!.type).toBe("text");
        expect(blocks[1]!.type).toBe("bullets");
        expect(childrenOf(blocks[1]!).map(tagOf)).toEqual(["One", "Two"]);
    });

    it("treats a multi-paragraph body placeholder as bulleted by default", () => {
        const blocks = textBlocksOf([para("One"), para("Two")], "body");
        expect(blocks).toHaveLength(1);
        expect(blocks[0]!.type).toBe("bullets");
    });

    it("numbers a buAutoNum list", () => {
        const blocks = textBlocksOf([para("One", { bullet: true, numbered: true })], undefined);
        expect(blocks[0]!.data).toMatchObject({ marker: "number" });
    });

    it("carries bold and italic runs as marks with correct offsets", () => {
        const blocks = textBlocksOf(
            [{ runs: [{ text: "Plain " }, { text: "bold", b: true }, { text: " tail" }], lvl: 0 }],
            undefined,
        );
        const data = blocks[0]!.data as {
            text: string;
            marks?: { from: number; to: number; type: string }[];
        };
        expect(data.text).toBe("Plain bold tail");
        expect(data.marks).toEqual([{ from: 6, to: 10, type: "b" }]);
    });

    it("drops the bold mark when every run is bold", () => {
        const blocks = textBlocksOf([{ runs: [{ text: "All bold", b: true }], lvl: 0 }], undefined);
        expect((blocks[0]!.data as { marks?: unknown[] }).marks).toBeUndefined();
    });
});

describe("nearestThemeId", () => {
    it("returns the exact theme when the scheme matches its tokens", () => {
        const t = THEME_LIST.find(
            (x) =>
                /^#[0-9a-fA-F]{6}$/.test(x.tokens.bg) &&
                /^#[0-9a-fA-F]{6}$/.test(x.tokens.ink) &&
                /^#[0-9a-fA-F]{6}$/.test(x.tokens.accent),
        )!;
        const id = nearestThemeId({
            lt1: t.tokens.bg,
            dk1: t.tokens.ink,
            accent1: t.tokens.accent,
        });
        expect(resolveTheme(id).tokens.bg).toBe(t.tokens.bg);
        expect(resolveTheme(id).tokens.ink).toBe(t.tokens.ink);
    });

    it("falls back to studio without a usable scheme", () => {
        expect(nearestThemeId({})).toBe("studio");
    });
});

describe("deckToContent", () => {
    const deck = (
        slides: PptxDeck["slides"],
        size: Partial<Pick<PptxDeck, "w" | "h">> = {},
    ): PptxDeck => ({
        w: size.w ?? 1280,
        h: size.h ?? 720,
        scheme: { lt1: "#ffffff", dk1: "#111111", accent1: "#3355ff" },
        fonts: {},
        layouts: [],
        slides,
    });

    const media = { path: "ppt/media/image1.png", mime: "image/png", data: "aGk=" };
    const urls = new Map([["ppt/media/image1.png", "/api/media/asset/abc"]]);
    const mediaUrl = (p: string): string | undefined => urls.get(p);

    it("maps a title slide with a side image into sections", () => {
        const shapes: PptxShape[] = [
            { kind: "sp", box: box(80, 60, 1120, 100), role: "title", paras: [para("Welcome")] },
            {
                kind: "sp",
                box: box(80, 220, 640, 300),
                paras: [para("Body text", { bullet: false })],
            },
            { kind: "picture", box: box(780, 220, 420, 300), media },
        ];
        const content = deckToContent(deck([{ shapes }]), mediaUrl);
        expect(isArtifactContent(content)).toBe(true);
        expect(content.format).toBe("deck");
        expect(content.page).toBeUndefined();
        expect(content.sections).toHaveLength(1);
        const root = content.sections[0]!.root;
        const rows = childrenOf(root);
        expect(rows).toHaveLength(2);
        expect(rows[0]!.data).toMatchObject({ text: "Welcome", style: "h2" });
        const cols = childrenOf(rows[1]!);
        expect(cols[0]!.data).toMatchObject({ text: "Body text" });
        expect(cols[1]!.type).toBe("image");
        expect(cols[1]!.data).toMatchObject({ src: "/api/media/asset/abc" });
    });

    it("consumes a slide-covering filled shape as the section background", () => {
        const shapes: PptxShape[] = [
            { kind: "sp", box: box(0, 0, 1280, 720), fill: "#202030", paras: [] },
            { kind: "sp", box: box(80, 60, 800, 100), role: "title", paras: [para("Dark")] },
        ];
        const content = deckToContent(deck([{ shapes }]), mediaUrl);
        const section = content.sections[0]!;
        expect(section.background).toEqual({ kind: "color", color: "#202030" });
        expect(section.root.data).toMatchObject({ text: "Dark" });
    });

    it("drops slide-number chrome and keeps notes", () => {
        const shapes: PptxShape[] = [
            { kind: "sp", box: box(80, 60, 800, 100), role: "title", paras: [para("Only")] },
            { kind: "sp", box: box(1180, 680, 80, 30), role: "meta", paras: [para("4")] },
        ];
        const content = deckToContent(deck([{ shapes, notes: "Pause here." }]), mediaUrl);
        expect(content.sections[0]!.root.data).toMatchObject({ text: "Only" });
        expect(content.sections[0]!.notes).toEqual({ spoken: "Pause here.", source: "human" });
    });

    it("maps a chart shape onto the chart grammar", () => {
        const shapes: PptxShape[] = [
            {
                kind: "chart",
                box: box(80, 60, 1000, 500),
                chart: {
                    type: "column",
                    categories: ["Q1, actual", "Q2"],
                    series: [{ name: "Units", values: [48, 62] }],
                },
            },
        ];
        const content = deckToContent(deck([{ shapes }]), mediaUrl);
        const chart = content.sections[0]!.root;
        expect(chart.type).toBe("columnChart");
        expect(chart.data).toMatchObject({
            type: "column",
            values: "48, 62",
            categories: "Q1 actual, Q2",
            seriesNames: "Units",
        });
    });

    it("maps a table shape onto the cells grid", () => {
        const shapes: PptxShape[] = [
            {
                kind: "table",
                box: box(80, 60, 1000, 300),
                cells: [
                    ["Region", "Units"],
                    ["North", "820"],
                ],
                header: true,
            },
        ];
        const content = deckToContent(deck([{ shapes }]), mediaUrl);
        const table = content.sections[0]!.root;
        expect(table.type).toBe("table");
        expect(table.data).toMatchObject({ cols: 2, rows: 2, header: true });
        const cells = (table.data as { cells: ElementInstance[] }).cells;
        expect(cells.map(tagOf)).toEqual(["Region", "Units", "North", "820"]);
    });

    it("scales a non-16:9 deck onto a 1280-wide page", () => {
        const shapes: PptxShape[] = [
            { kind: "sp", box: box(96, 96, 768, 96), role: "title", paras: [para("4:3")] },
        ];
        const content = deckToContent(deck([{ shapes }], { w: 960, h: 720 }), mediaUrl);
        expect(content.page).toEqual({ width: 1280, height: 960 });
    });
});

describe("importPptx", () => {
    // ws is only read when pictures need storing; a text-only deck must not touch it
    const ws = { id: "ws-1" } as Parameters<typeof importPptx>[0];

    it("rejects bytes that are not a pptx", async () => {
        await expect(
            importPptx(ws, { data: new Uint8Array([1, 2, 3]), name: "x.pptx" }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("imports a text-only deck without storing media", async () => {
        const PptxGenJS = (await import("pptxgenjs")).default;
        const pptx = new PptxGenJS();
        pptx.title = "Words Only";
        const s = pptx.addSlide();
        s.addText("Hello import", { x: 1, y: 1, w: 8, h: 1, fontSize: 32 });
        const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
        const stored: unknown[] = [];
        const { content, title } = await importPptx(
            ws,
            { data: new Uint8Array(buf), name: "words.pptx" },
            async (m) => {
                stored.push(m);
                return "/api/media/asset/x";
            },
        );
        expect(stored).toHaveLength(0);
        expect(title).toBe("Words Only");
        expect(content.sections).toHaveLength(1);
        expect(JSON.stringify(content)).toContain("Hello import");
    });
});

describe("google slides links", () => {
    it("extracts the file id from the canonical url forms", () => {
        expect(
            slidesFileId(
                "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWx/edit#slide=id.p",
            ),
        ).toBe("1AbCdEfGhIjKlMnOpQrStUvWx");
        expect(slidesFileId("https://docs.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWx")).toBe(
            "1AbCdEfGhIjKlMnOpQrStUvWx",
        );
        expect(slidesFileId("https://example.com/whatever")).toBeNull();
    });

    it("rejects a non-slides url without fetching", async () => {
        await expect(fetchSlidesPptx("https://example.com/x")).rejects.toBeInstanceOf(ImportError);
    });

    it("treats an html answer as a private deck", async () => {
        const fetcher = (async () =>
            new Response("<html>sign in</html>", {
                status: 200,
                headers: { "content-type": "text/html" },
            })) as typeof fetch;
        await expect(
            fetchSlidesPptx(
                "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWx/edit",
                fetcher,
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("returns the bytes of a public export", async () => {
        const fetcher = (async () =>
            new Response(new Uint8Array([80, 75, 3, 4]), {
                status: 200,
                headers: {
                    "content-type":
                        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                },
            })) as typeof fetch;
        const { data } = await fetchSlidesPptx(
            "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWx/edit",
            fetcher,
        );
        expect([...data]).toEqual([80, 75, 3, 4]);
    });
});

describe("themeFromDeck", () => {
    const deck = (
        scheme: Record<string, string>,
        fonts: { major?: string; minor?: string } = {},
        title?: string,
    ): Pick<PptxDeck, "scheme" | "fonts" | "title"> => ({
        scheme,
        fonts,
        ...(title ? { title } : {}),
    });

    it("adopts the deck's own palette rather than the nearest built-in", () => {
        const t = themeFromDeck(deck({ lt1: "#fdf6e3", dk1: "#1c2b2d", accent1: "#b7410e" }));
        expect(t.tokens.bg).toBe("#fdf6e3");
        expect(t.tokens.ink).toBe("#1c2b2d");
        expect(t.tokens.accent).toBe("#b7410e");
        expect(t.isDark).toBe(false);
        // the derived steps sit between ink and bg, which is what keeps a palette readable
        expect(t.tokens.soft).not.toBe(t.tokens.ink);
        expect(t.tokens.muted).not.toBe(t.tokens.soft);
    });

    it("reads a dark master as a dark theme", () => {
        const t = themeFromDeck(deck({ lt1: "#12151a", dk1: "#f2f4f8", accent1: "#7cc4ff" }));
        expect(t.isDark).toBe(true);
        expect(t.tokens.bg).toBe("#12151a");
    });

    it("picks the label colour on the accent for contrast, never by assumption", () => {
        const onLight = themeFromDeck(deck({ lt1: "#ffffff", dk1: "#111111", accent1: "#ffe066" }));
        const onDark = themeFromDeck(deck({ lt1: "#ffffff", dk1: "#111111", accent1: "#123499" }));
        expect(onLight.tokens.onAccent).toBe("#111111");
        expect(onDark.tokens.onAccent).toBe("#ffffff");
    });

    it("falls back to a readable pair when the scheme is missing or malformed", () => {
        const t = themeFromDeck(deck({ lt1: "not-a-colour" }));
        expect(t.tokens.bg).toBe("#ffffff");
        expect(t.tokens.ink).toBe("#111111");
        expect(t.name).toBe("Imported deck");
    });

    it("names the theme after the deck", () => {
        expect(themeFromDeck(deck({}, {}, "Northwind 2026")).name).toBe("Northwind 2026");
    });
});

describe("vendoredFace", () => {
    it("maps an unservable family to the closest face we can actually serve", () => {
        expect(vendoredFace("Georgia", "body")).toBe("Lora");
        expect(vendoredFace("Times New Roman", "display")).toBe("Newsreader");
        expect(vendoredFace("Century Gothic", "body")).toBe("Jost");
        expect(vendoredFace("Arial Narrow", "display")).toBe("Oswald");
        expect(vendoredFace("Consolas", "body")).toBe("IBM Plex Mono");
    });

    it("an unknown or absent family falls to the neutral grotesque", () => {
        expect(vendoredFace("Wingdings 3", "body")).toBe("Hanken Grotesk");
        expect(vendoredFace(undefined, "display")).toBe("Archivo");
    });

    it("every face it can return is one the theme library actually vendors", () => {
        const served = new Set([...DISPLAY_FONTS, ...BODY_FONTS, ...MONO_FONTS]);
        for (const name of ["Georgia", "Futura", "Impact", "Consolas", "Calibri", undefined])
            for (const role of ["display", "body"] as const)
                expect(served.has(vendoredFace(name, role))).toBe(true);
    });
});

describe("layoutsToContent", () => {
    // a .potx: a master's layouts, no slides at all
    const template = (): PptxDeck => ({
        w: 1280,
        h: 720,
        scheme: { lt1: "#ffffff", dk1: "#111111" },
        fonts: {},
        slides: [],
        layouts: [
            {
                name: "Title Slide",
                slots: [{ role: "ctrTitle", box: { x: 100, y: 260, w: 1080, h: 120 } }],
            },
            {
                name: "Two Content",
                slots: [
                    { role: "title", box: { x: 60, y: 40, w: 1160, h: 100 } },
                    { role: "body", box: { x: 60, y: 180, w: 540, h: 440 } },
                    { role: "media", box: { x: 680, y: 180, w: 540, h: 440 } },
                ],
            },
            { name: "Blank", slots: [] },
        ],
    });

    it("gives every layout with slots a section, and skips the empty ones", () => {
        const content = layoutsToContent(template());
        expect(content.sections).toHaveLength(2);
        expect(isArtifactContent(content)).toBe(true);
    });

    it("keeps a layout's arrangement: a title over its side-by-side slots", () => {
        const content = layoutsToContent(template());
        const forms = sectionForms(content);
        expect(forms[0]!.blocks).toEqual(["text"]);
        // the title bands into its own row, the two content slots share the one below it
        const rows = childrenRaw(content.sections[1]!.root) ?? [];
        expect(rows).toHaveLength(2);
        const columns = childrenRaw(rows[1]!) ?? [];
        expect(columns.map((c) => c.type)).toEqual(["text", "media"]);
    });
});
