import { describe, expect, it } from "vitest";
import { assemblePack, chunkText, type RetrievedChunk } from "../context";

const para = (ch: string, len: number): string => ch.repeat(len);

describe("chunkText", () => {
    it("returns nothing for blank input", () => {
        expect(chunkText("")).toEqual([]);
        expect(chunkText("   \n\n  ")).toEqual([]);
    });

    it("keeps short text as a single chunk", () => {
        expect(chunkText("one small note")).toEqual(["one small note"]);
    });

    it("normalizes CRLF line endings", () => {
        expect(chunkText("a\r\nb\r\rc")).toEqual(["a\nb\n\nc"]);
    });

    it("splits on paragraph boundaries, not mid-sentence", () => {
        const text = [para("a", 500), para("b", 500), para("c", 500)].join("\n\n");
        const chunks = chunkText(text, 800, 100);
        expect(chunks.length).toBeGreaterThan(1);
        // every paragraph survives somewhere, intact
        for (const ch of ["a", "b", "c"]) {
            expect(chunks.some((c) => c.includes(para(ch, 500)))).toBe(true);
        }
    });

    it("carries an overlap tail between consecutive chunks", () => {
        const text = [para("a", 700), para("b", 700)].join("\n\n");
        const [first, second] = chunkText(text, 800, 100);
        expect(first).toBe(para("a", 700));
        // the second chunk opens with the tail of the first
        expect(second!.startsWith(para("a", 100))).toBe(true);
        expect(second).toContain(para("b", 700));
    });

    it("hard-splits a paragraph longer than a whole chunk, dropping nothing", () => {
        const text = para("x", 3000);
        const chunks = chunkText(text, 1000, 100);
        const joined = chunks.join("");
        expect(joined.length).toBeGreaterThanOrEqual(3000);
        expect(chunks.every((c) => c.length <= 1000 + 100 + 2)).toBe(true);
    });
});

describe("assemblePack", () => {
    const row = (title: string, kind: string, text: string): RetrievedChunk => ({
        title,
        kind,
        text,
    });

    it("returns null for no rows", () => {
        expect(assemblePack([])).toBeNull();
    });

    it("groups chunks under a labelled source line", () => {
        const pack = assemblePack([
            row("Q3 report", "file", "Revenue rose 12%."),
            row("Q3 report", "file", "Churn fell to 2%."),
            row("acme.com", "link", "Acme sells anvils."),
        ]);
        expect(pack).toContain("From Q3 report (an uploaded file):");
        expect(pack).toContain("From acme.com (a saved link):");
        expect(pack).toContain("> Revenue rose 12%.");
        expect(pack).toContain("> Churn fell to 2%.");
    });

    it("labels artifact, template, and pasted sources", () => {
        const pack = assemblePack([
            row("Old deck", "artifact", "A fact."),
            row("Sales deck", "template", "A starter fact."),
            row("Notes", "text", "Another fact."),
        ]);
        expect(pack).toContain("(your library)");
        expect(pack).toContain("(a Galleo template)");
        expect(pack).toContain("(pasted material)");
    });

    it("stops keeping chunks once the budget is spent, but never returns empty-handed", () => {
        const big = "z".repeat(3000);
        const pack = assemblePack(
            [row("first", "file", big), row("second", "file", "small late fact")],
            4000,
        );
        expect(pack).toContain(big);
        // the second chunk still fits under the 4000 budget
        expect(pack).toContain("small late fact");
        const tight = assemblePack(
            [row("first", "file", big), row("second", "file", "y".repeat(2000))],
            4000,
        );
        expect(tight).toContain(big);
        expect(tight).not.toContain("y".repeat(2000));
    });
});
