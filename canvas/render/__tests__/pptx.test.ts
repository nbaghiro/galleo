import { describe, expect, it } from "vitest";
import type { RenderCommand, TextLeaf } from "@engine/node";
import type { RunLine } from "@canvas/render/commands";
import {
    SLIDE_IN_H,
    SLIDE_IN_W,
    SLIDE_PX_H,
    SLIDE_PX_W,
    classify,
    cssColor,
    embeddedFontListXml,
    familyFromFont,
    frameCommand,
    googleCssUrl,
    hasText,
    inch,
    italicFromFont,
    leafForRuns,
    localize,
    parseFontUrl,
    patchContentTypes,
    patchPresentationRels,
    patchPresentationXml,
    pt,
    rectShapeSpec,
    slideTransform,
    slotFor,
    textSpec,
    weightFromFont,
} from "@canvas/render/pptx";

// ---- mappers ----

describe("cssColor", () => {
    it("parses #rrggbb, shorthand, and #rrggbbaa", () => {
        expect(cssColor("#A8572C")).toEqual({ color: "A8572C" });
        expect(cssColor("#fff")).toEqual({ color: "FFFFFF" });
        expect(cssColor("#00000080")).toEqual({ color: "000000", transparency: 50 });
    });
    it("parses rgb()/rgba() into hex + transparency", () => {
        expect(cssColor("rgb(120, 120, 120)")).toEqual({ color: "787878" });
        expect(cssColor("rgba(0,0,0,0.12)")).toEqual({ color: "000000", transparency: 88 });
    });
    it("returns null for empty or unparseable input", () => {
        expect(cssColor(undefined)).toBeNull();
        expect(cssColor("teal")).toBeNull();
    });
});

describe("font parsing", () => {
    it("pulls the family from a stack or a full font shorthand", () => {
        expect(familyFromFont("'Fraunces', serif")).toBe("Fraunces");
        expect(familyFromFont("italic 700 44px 'Hanken Grotesk', sans-serif")).toBe(
            "Hanken Grotesk",
        );
        expect(familyFromFont("600 17px 'DM Mono', monospace")).toBe("DM Mono");
    });
    it("reads weight and italic from a shorthand", () => {
        expect(weightFromFont("600 44px 'Fraunces', serif")).toBe(600);
        expect(weightFromFont("italic 400 17px 'X', sans-serif")).toBe(400);
        expect(weightFromFont("'X', serif")).toBe(400); // no weight present → default
        expect(italicFromFont("italic 400 17px 'X'")).toBe(true);
        expect(italicFromFont("400 17px 'X'")).toBe(false);
    });
});

describe("unit conversion", () => {
    it("maps px→inch (96dpi) and px→pt (72/96)", () => {
        expect(inch(1280)).toBeCloseTo(SLIDE_IN_W, 6);
        expect(inch(720)).toBeCloseTo(SLIDE_IN_H, 6);
        expect(pt(16)).toBe(12);
    });
});

describe("slideTransform", () => {
    it("is identity for a standard 1280×720 deck page", () => {
        const t = slideTransform({ w: SLIDE_PX_W, h: SLIDE_PX_H, contentH: SLIDE_PX_H });
        expect(t).toEqual({ fit: 1, offX: 0, offY: 0 });
    });
    it("scales content down and centers it when the page content overflows its frame", () => {
        const t = slideTransform({ w: 1280, h: 720, contentH: 1440 });
        expect(t.fit).toBeCloseTo(0.5, 6);
        expect(t.offX).toBeCloseTo(320, 6); // (1280 - 1280·0.5)/2
        expect(t.offY).toBeCloseTo(0, 6); // 1440·0.5 == 720 fills the frame
    });
    it("letterboxes an odd-aspect page into the fixed 16:9 slide", () => {
        // a 21:9-ish page (1280×548) contains into 1280×720 at scale 1, centered vertically
        const t = slideTransform({ w: 1280, h: 548, contentH: 548 });
        expect(t.fit).toBeCloseTo(1, 6);
        expect(t.offY).toBeCloseTo((720 - 548) / 2, 6);
    });
});

describe("frameCommand", () => {
    const t = { fit: 0.5, offX: 100, offY: 40 };
    it("places the box and scales intrinsic lengths for a rect", () => {
        const c: RenderCommand = {
            kind: "rect",
            box: { x: 20, y: 10, w: 200, h: 100 },
            fill: { color: "#fff", radius: 16, border: { color: "#000", width: 4 } },
        };
        const f = frameCommand(c, t);
        expect(f.box).toEqual({ x: 110, y: 45, w: 100, h: 50 }); // 100 + 20·0.5, 40 + 10·0.5, …
        if (f.kind !== "rect") throw new Error("kind");
        expect(f.fill?.radius).toBe(8);
        expect(f.fill?.border?.width).toBe(2);
    });
    it("scales text size and line height", () => {
        const c: RenderCommand = {
            kind: "text",
            box: { x: 0, y: 0, w: 100, h: 40 },
            text: { text: "hi", fontId: "'X', serif", size: 40, wrap: "words" },
        };
        const f = frameCommand(c, t);
        if (f.kind !== "text") throw new Error("kind");
        expect(f.text.size).toBe(20);
        expect(f.text.lineHeight).toBeCloseTo(40 * 1.35 * 0.5, 6); // default lineHeight scaled
    });
});

describe("localize", () => {
    it("moves a framed box to the origin and rebases its clip", () => {
        const c: RenderCommand = {
            kind: "surface",
            box: { x: 300, y: 200, w: 120, h: 80 },
            clip: { x: 310, y: 205, w: 100, h: 70 },
            paint: () => {},
        };
        const l = localize(c);
        expect(l.box).toEqual({ x: 0, y: 0, w: 120, h: 80 });
        expect(l.clip).toEqual({ x: 10, y: 5, w: 100, h: 70 });
    });
});

describe("classify", () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    it("routes solid/bordered rects to a native shape", () => {
        expect(classify({ kind: "rect", box, fill: { color: "#fff" } })).toBe("shape");
    });
    it("rasterizes gradient or clipped rects, images, and surfaces", () => {
        expect(
            classify({ kind: "rect", box, fill: { gradient: { from: "#000", to: "#fff" } } }),
        ).toBe("raster");
        expect(classify({ kind: "rect", box, fill: { color: "#fff" }, clip: box })).toBe("raster");
        expect(classify({ kind: "image", box, image: { src: "x", fit: "cover" } })).toBe("raster");
        expect(classify({ kind: "surface", box, paint: () => {} })).toBe("raster");
    });
    it("routes text to a text box", () => {
        expect(
            classify({
                kind: "text",
                box,
                text: { text: "a", fontId: "x", size: 12, wrap: "words" },
            }),
        ).toBe("text");
    });
});

describe("rectShapeSpec", () => {
    it("emits a solid fill with inch geometry", () => {
        const spec = rectShapeSpec({
            kind: "rect",
            box: { x: 96, y: 48, w: 192, h: 96 },
            fill: { color: "#A8572C" },
        });
        expect(spec).not.toBeNull();
        expect(spec!.round).toBe(false);
        expect(spec!.options).toMatchObject({ x: 1, y: 0.5, w: 2, h: 1 });
        expect(spec!.options.fill).toEqual({
            type: "solid",
            color: "A8572C",
            transparency: undefined,
        });
    });
    it("emits a rounded rect with a dashed border and no fill", () => {
        const spec = rectShapeSpec({
            kind: "rect",
            box: { x: 0, y: 0, w: 96, h: 96 },
            fill: { radius: 12, border: { color: "#000", width: 2, style: "dashed" } },
        });
        expect(spec!.round).toBe(true);
        expect(spec!.options.rectRadius).toBeCloseTo(inch(12), 6);
        expect(spec!.options.fill).toEqual({ type: "none" });
        expect(spec!.options.line).toMatchObject({ color: "000000", dashType: "dash" });
        expect(spec!.options.line!.width).toBeCloseTo(pt(2), 6);
    });
    it("returns null when there is nothing to paint", () => {
        expect(rectShapeSpec({ kind: "rect", box: { x: 0, y: 0, w: 1, h: 1 } })).toBeNull();
    });
});

describe("leafForRuns / hasText", () => {
    it("synthesizes a single run for a plain leaf and leaves a runs-leaf alone", () => {
        const plain: TextLeaf = { text: "hello", fontId: "x", size: 12, wrap: "words" };
        expect(leafForRuns(plain).runs).toEqual([{ text: "hello" }]);
        const withRuns: TextLeaf = { ...plain, runs: [{ text: "a" }, { text: "b", bold: true }] };
        expect(leafForRuns(withRuns)).toBe(withRuns);
    });
    it("detects whether any line carries visible text", () => {
        expect(hasText([{ frags: [], width: 0 }])).toBe(false);
        expect(
            hasText([
                {
                    frags: [
                        {
                            text: "x",
                            font: "12px X",
                            underline: false,
                            strike: false,
                            code: false,
                            x: 0,
                            width: 5,
                        },
                    ],
                    width: 5,
                },
            ]),
        ).toBe(true);
    });
});

describe("textSpec", () => {
    const frag = (text: string, over: Partial<RunLine["frags"][number]> = {}) => ({
        text,
        font: "600 40px 'Fraunces', serif",
        underline: false,
        strike: false,
        code: false,
        x: 0,
        width: 10,
        ...over,
    });
    const leaf: TextLeaf = {
        text: "Line one Line two",
        fontId: "'Fraunces', serif",
        size: 40,
        wrap: "words",
        align: "center",
        color: "#211C16",
        lineHeight: 54,
    };

    it("builds one styled run per fragment with a breakLine at each line end but the last", () => {
        const lines: RunLine[] = [
            { frags: [frag("Line"), frag("one")], width: 20 },
            { frags: [frag("Line"), frag("two")], width: 20 },
        ];
        const { runs, options } = textSpec(leaf, { x: 96, y: 96, w: 480, h: 108 }, lines);
        expect(runs.map((r) => r.text)).toEqual(["Line", "one", "Line", "two"]);
        // breakLine only on the last frag of the first line
        expect(runs[1]!.options!.breakLine).toBe(true);
        expect(runs[3]!.options!.breakLine).toBeUndefined();
        expect(runs[0]!.options!.bold).toBe(true); // weight 600 → bold
        // box geometry + type styling in the expected units
        expect(options).toMatchObject({ x: 1, y: 1, w: 5, h: 1.125, align: "center", wrap: false });
        expect(options.fontSize).toBeCloseTo(pt(40), 6);
        expect(options.lineSpacing).toBeCloseTo(pt(54), 6);
        expect(options.fontFace).toBe("Fraunces");
        expect(options.color).toBe("211C16");
    });

    it("maps run marks: italic, underline, strike, code→mono, color, highlight", () => {
        const lines: RunLine[] = [
            {
                frags: [
                    frag("i", { font: "italic 400 40px 'X', serif" }),
                    frag("u", { underline: true }),
                    frag("s", { strike: true }),
                    frag("c", { code: true, font: "400 40px ui-monospace, monospace" }),
                    frag("k", { color: "#FF0000", highlight: "#FFFF00" }),
                ],
                width: 50,
            },
        ];
        const { runs } = textSpec(leaf, { x: 0, y: 0, w: 480, h: 54 }, lines);
        expect(runs[0]!.options!.italic).toBe(true);
        expect(runs[1]!.options!.underline).toEqual({ style: "sng" });
        expect(runs[2]!.options!.strike).toBe("sngStrike");
        expect(runs[3]!.options!.fontFace).toBe("Consolas");
        expect(runs[4]!.options!.color).toBe("FF0000");
        expect(runs[4]!.options!.highlight).toBe("FFFF00");
    });

    it("emits a blank breaking run for an empty (blank) line", () => {
        const lines: RunLine[] = [
            { frags: [], width: 0 },
            { frags: [frag("after")], width: 10 },
        ];
        const { runs } = textSpec(leaf, { x: 0, y: 0, w: 480, h: 108 }, lines);
        expect(runs[0]).toEqual({ text: "", options: { breakLine: true } });
    });
});

// ---- font embedding ----

describe("slotFor", () => {
    it("buckets weight (>=600 bold) × italic into the four PowerPoint slots", () => {
        expect(slotFor(400, false)).toBe("regular");
        expect(slotFor(560, false)).toBe("regular"); // below the bold cutoff
        expect(slotFor(700, false)).toBe("bold");
        expect(slotFor(400, true)).toBe("italic");
        expect(slotFor(800, true)).toBe("boldItalic");
    });
});

describe("googleCssUrl", () => {
    it("builds a css2 request with + for spaces and the ital,wght tuple", () => {
        expect(googleCssUrl("Fraunces", 600, false)).toBe(
            "https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,600&display=swap",
        );
        expect(googleCssUrl("Hanken Grotesk", 400, true)).toBe(
            "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@1,400&display=swap",
        );
    });
});

describe("parseFontUrl", () => {
    const css = `/* cyrillic */
@font-face { font-family: 'X'; src: url(https://fonts.gstatic.com/s/x/cyr.woff2) format('woff2'); }
/* latin */
@font-face { font-family: 'X'; src: url(https://fonts.gstatic.com/s/x/latin.woff2) format('woff2'); }`;
    it("prefers the latin subset block and flags woff2", () => {
        expect(parseFontUrl(css)).toEqual({
            url: "https://fonts.gstatic.com/s/x/latin.woff2",
            woff2: true,
        });
    });
    it("accepts a plain ttf (legacy-UA response) without the transcode flag", () => {
        const ttf = `@font-face { src: url(https://fonts.gstatic.com/s/x/x.ttf) format('truetype'); }`;
        expect(parseFontUrl(ttf)).toEqual({
            url: "https://fonts.gstatic.com/s/x/x.ttf",
            woff2: false,
        });
    });
    it("returns null when there is no usable font url", () => {
        expect(parseFontUrl("/* latin */ @font-face { src: local('X'); }")).toBeNull();
    });
});

describe("embeddedFontListXml", () => {
    it("emits one embeddedFont per family with slots in schema order", () => {
        const xml = embeddedFontListXml([
            {
                typeface: "Fraunces",
                slots: [
                    { slot: "bold", relId: "rIdFont2" },
                    { slot: "regular", relId: "rIdFont1" },
                ],
            },
        ]);
        expect(xml).toBe(
            '<p:embeddedFontLst><p:embeddedFont><p:font typeface="Fraunces"/>' +
                '<p:regular r:id="rIdFont1"/><p:bold r:id="rIdFont2"/>' +
                "</p:embeddedFont></p:embeddedFontLst>",
        );
    });
    it("escapes the typeface name", () => {
        const xml = embeddedFontListXml([{ typeface: 'A & "B"', slots: [] }]);
        expect(xml).toContain('typeface="A &amp; &quot;B&quot;"');
    });
});

describe("patchContentTypes", () => {
    it("adds the fntdata default once, before </Types>", () => {
        const base = '<Types><Default Extension="xml" ContentType="application/xml"/></Types>';
        const out = patchContentTypes(base);
        expect(out).toContain(
            '<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>',
        );
        expect(patchContentTypes(out)).toBe(out); // idempotent
    });
});

describe("patchPresentationRels", () => {
    it("inserts font relationships before </Relationships>", () => {
        const base = '<Relationships><Relationship Id="rId1"/></Relationships>';
        const out = patchPresentationRels(base, [
            { id: "rIdFont1", target: "fonts/font1.fntdata" },
        ]);
        expect(out).toContain(
            '<Relationship Id="rIdFont1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font1.fntdata"/></Relationships>',
        );
    });
});

describe("patchPresentationXml", () => {
    const base =
        '<p:presentation xmlns:r="..." saveSubsetFonts="1"><p:sldSz cx="1" cy="1"/><p:notesSz cx="1" cy="1"/><p:defaultTextStyle/></p:presentation>';
    const families = [
        { typeface: "Fraunces", slots: [{ slot: "regular" as const, relId: "rIdFont1" }] },
    ];

    it("turns on embedTrueTypeFonts and inserts the list before defaultTextStyle", () => {
        const out = patchPresentationXml(base, families);
        expect(out).toContain(
            '<p:presentation xmlns:r="..." saveSubsetFonts="1" embedTrueTypeFonts="1">',
        );
        expect(out).toContain("<p:embeddedFontLst>");
        // schema order: embeddedFontLst immediately precedes defaultTextStyle
        expect(out.indexOf("<p:embeddedFontLst>")).toBeLessThan(out.indexOf("<p:defaultTextStyle"));
        expect(out.indexOf("</p:notesSz>") === -1 && out.indexOf("<p:notesSz")).toBeLessThan(
            out.indexOf("<p:embeddedFontLst>"),
        );
    });
    it("does not double-add the embed attribute", () => {
        const out = patchPresentationXml(base, families);
        expect(out.match(/embedTrueTypeFonts=/g)!.length).toBe(1);
    });
});
