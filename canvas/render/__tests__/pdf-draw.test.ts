import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
    drawTextAbs,
    emitRect,
    pdfColor,
    pdfDrawContext,
    roundRectPath,
    type Ctx,
} from "@canvas/render/pdf-draw";

describe("pdfColor", () => {
    it("parses hex, shorthand, and #rrggbbaa", () => {
        expect(pdfColor("#ff0000")).toEqual({ rgb: [1, 0, 0], alpha: 1 });
        expect(pdfColor("#000")!.rgb).toEqual([0, 0, 0]);
        expect(pdfColor("#00000080")!.alpha).toBeCloseTo(0.5, 1);
    });
    it("parses rgb()/rgba()", () => {
        expect(pdfColor("rgb(255,0,0)")).toEqual({ rgb: [1, 0, 0], alpha: 1 });
        expect(pdfColor("rgba(0,0,0,0.5)")).toEqual({ rgb: [0, 0, 0], alpha: 0.5 });
    });
    it("returns null for unparseable / empty", () => {
        expect(pdfColor("teal")).toBeNull();
        expect(pdfColor(undefined)).toBeNull();
    });
});

describe("roundRectPath", () => {
    it("is a plain rect when radius ≤ 0", () => {
        expect(roundRectPath(0, 0, 10, 10, 0)).toBe("M0 0h10v10h-10Z");
    });
    it("uses arc segments when rounded, clamped to half the box", () => {
        expect(roundRectPath(0, 0, 20, 20, 4)).toContain("a4 4 0 0 1");
        expect(roundRectPath(0, 0, 20, 20, 999)).toContain("a10 10"); // clamped to w/2
    });
});

// Generate a real PDF and inspect its (inflated) content stream — verifies native emission end-to-end.
async function contentStream(draw: (ctx: Ctx) => void | Promise<void>): Promise<string> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([200, 200]);
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const ctx: Ctx = { doc: pdf, page, pageH: 200, fonts: () => helv };
    await draw(ctx);
    const buf = Buffer.from(await pdf.save({ useObjectStreams: false }));
    let idx = 0;
    while (idx < buf.length) {
        const s = buf.indexOf("stream", idx);
        if (s < 0) break;
        let d = s + 6;
        if (buf[d] === 0x0d) d++;
        if (buf[d] === 0x0a) d++;
        const e = buf.indexOf("endstream", d);
        if (e < 0) break;
        const raw = buf.subarray(d, e);
        let text = "";
        try {
            text = inflateSync(raw).toString("latin1");
        } catch {
            text = raw.toString("latin1");
        }
        if (text.length && !/[^\x09\x0a\x0d\x20-\x7e]/.test(text)) return text;
        idx = e + 9;
    }
    return "";
}

describe("native PDF emission", () => {
    it("emits a filled + stroked rect as vector path ops", async () => {
        const s = await contentStream((ctx) =>
            emitRect(
                ctx,
                { x: 10, y: 10, w: 50, h: 30 },
                {
                    color: "#ff0000",
                    border: { color: "#000000", width: 2 },
                },
            ),
        );
        expect(s).toContain("1 0 0 rg"); // red fill
        expect(s).toMatch(/\bm\b/); // moveTo present
        expect(s).toMatch(/\b[fBS]\b/); // fill / fillAndStroke / stroke
    });

    it("emits real text (BT … Tj … ET)", async () => {
        const s = await contentStream((ctx) =>
            drawTextAbs(ctx, "Hi", 20, 20, { size: 12, fill: "#000000" }),
        );
        expect(s).toContain("BT");
        expect(s).toContain("ET");
        expect(s).toMatch(/Tj|TJ/);
    });

    it("paints surface primitives natively (circle bezier + colored fill)", async () => {
        const s = await contentStream((ctx) => {
            const g = pdfDrawContext(ctx, 0, 0);
            g.circle(50, 50, 20, { fill: "#0000ff" });
            g.polyline(
                [
                    [0, 0],
                    [10, 10],
                    [20, 0],
                ],
                { stroke: "#00ff00", width: 2 },
            );
        });
        expect(s).toContain("0 0 1 rg"); // blue fill
        expect(s).toMatch(/\bc\b/); // cubic bezier (circle)
    });
});
