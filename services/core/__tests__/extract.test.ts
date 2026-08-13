import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractUpload, textLooksReadable, ExtractError, type ImageReader } from "../extract";
import { BODY_CAP } from "../context";

const b64 = (s: string | Uint8Array): string => Buffer.from(s).toString("base64");

const neverRead: ImageReader = () => {
    throw new Error("the model must not be called for this input");
};

// the env seam: providerReady("google") gates the vision paths
let savedKey: string | undefined;
beforeEach(() => {
    savedKey = process.env.GOOGLE_API_KEY;
    process.env.GOOGLE_API_KEY = "test-key";
});
afterEach(() => {
    if (savedKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = savedKey;
});

async function pdfWith(pages: string[][]): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const lines of pages) {
        const page = doc.addPage([400, 400]);
        lines.forEach((line, i) => page.drawText(line, { x: 40, y: 340 - i * 24, font, size: 12 }));
    }
    return doc.save();
}

describe("extractUpload", () => {
    it("reads plain text without touching the model", async () => {
        const out = await extractUpload(
            { name: "notes.txt", mime: "text/plain", data: b64("plain enough") },
            neverRead,
        );
        expect(out).toMatchObject({ title: "notes.txt", text: "plain enough", via: "text" });
        expect(out.truncated).toBe(false);
    });

    it("a text-layer PDF never calls vision", async () => {
        const line = "The Lumen One runs at 18 decibels and that is the whole point of it.";
        const bytes = await pdfWith([[line, line], [line]]);
        const out = await extractUpload(
            { name: "spec.pdf", mime: "application/pdf", data: b64(bytes) },
            neverRead,
        );
        expect(out.via).toBe("text");
        expect(out.text).toContain("18 decibels");
    });

    it("a scanned PDF falls back to the model reading the same bytes", async () => {
        const bytes = await pdfWith([[], []]);
        const seen: string[] = [];
        const read: ImageReader = (f) => {
            seen.push(f.mime);
            return Promise.resolve("OCR of the scan");
        };
        const out = await extractUpload(
            { name: "scan.pdf", mime: "application/pdf", data: b64(bytes) },
            read,
        );
        expect(out).toMatchObject({ text: "OCR of the scan", via: "vision" });
        expect(seen).toEqual(["application/pdf"]);
    });

    it("images go straight to the model", async () => {
        const out = await extractUpload(
            { name: "chart.png", mime: "image/png", data: b64("fakepng") },
            () => Promise.resolve("A bar chart of Q3 revenue: 4.8M."),
        );
        expect(out).toMatchObject({ via: "vision" });
        expect(out.text).toContain("Q3 revenue");
    });

    it("vision inputs 503 when no Google key is configured", async () => {
        delete process.env.GOOGLE_API_KEY;
        await expect(
            extractUpload({ name: "chart.png", mime: "image/png", data: b64("x") }, neverRead),
        ).rejects.toMatchObject({ status: 503 });
    });

    it("rejects legacy and unknown formats with actionable copy", async () => {
        await expect(
            extractUpload({ name: "old.xls", mime: "", data: b64("x") }, neverRead),
        ).rejects.toThrow(/save it as \.docx, \.xlsx, or CSV/);
        await expect(
            extractUpload({ name: "movie.mp4", mime: "video/mp4", data: b64("x") }, neverRead),
        ).rejects.toThrow(/isn't a supported file/);
    });

    it("rejects oversized files before parsing", async () => {
        const big = Buffer.alloc(8_000_001).toString("base64");
        await expect(
            extractUpload({ name: "huge.png", mime: "image/png", data: big }, neverRead),
        ).rejects.toThrow(/too large/);
    });

    it("rejects empty extractions and truncates at the shared body cap", async () => {
        await expect(
            extractUpload({ name: "blank.txt", mime: "text/plain", data: b64("   ") }, neverRead),
        ).rejects.toMatchObject({ status: 400 });

        const long = "y".repeat(BODY_CAP + 500);
        const out = await extractUpload(
            { name: "long.txt", mime: "text/plain", data: b64(long) },
            neverRead,
        );
        expect(out.text.length).toBe(BODY_CAP);
        expect(out.truncated).toBe(true);
    });

    it("tells a real text layer from broken-CMap symbol soup", () => {
        expect(
            textLooksReadable(
                "The Lumen One runs at 18 decibels on Night mode, and filters cost $12 per quarter.",
            ),
        ).toBe(true);
        // the shape of an extraction whose font map lost its ToUnicode table
        expect(textLooksReadable('.%" 5$+#,.6 )! *"".&0"3 .%" 5 1."/$.6 %)$"--%"(!".*.%"')).toBe(
            false,
        );
        expect(textLooksReadable("")).toBe(false);
    });

    it("typed failures are ExtractError, so the route can map them", async () => {
        const err = await extractUpload(
            { name: "movie.mp4", mime: "video/mp4", data: b64("x") },
            neverRead,
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ExtractError);
        expect((err as ExtractError).status).toBe(400);
    });
});
