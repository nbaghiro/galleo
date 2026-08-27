import { describe, expect, it } from "vitest";
import type { TextLeaf } from "@engine/node";
import { layoutRuns, leafForRuns } from "@canvas/render/commands";
import { measure, runLayout, textMetricsCtx, textNode } from "@canvas/testkit";

const cx = textMetricsCtx();
const leaf = (text: string, extra?: Partial<TextLeaf>): TextLeaf => ({
    text,
    fontId: "f",
    size: 12,
    lineHeight: 16,
    wrap: "words",
    ...extra,
});

describe("line boxes", () => {
    it("attaches lines to every emitted text command", () => {
        const { commands } = runLayout(textNode("one two three", { id: "t" }), 200, 100);
        const cmd = commands.find((c) => c.kind === "text");
        expect(cmd?.kind).toBe("text");
        if (cmd?.kind !== "text") return;
        expect(cmd.lines?.length).toBe(1);
        expect(cmd.lines![0]!.frags.map((f) => f.text)).toEqual(["one", " ", "two", " ", "three"]);
    });

    it("offsets are total: every frag maps back into the source string", () => {
        const text = "alpha beta  gamma\ndelta";
        const laid = layoutRuns(cx, leafForRuns(leaf(text)), 60);
        for (const line of laid.lines)
            for (const f of line.frags)
                if (f.text !== " ") expect(text.slice(f.from, f.from + f.text.length)).toBe(f.text);
        // lines cover ascending, non-overlapping source ranges
        for (let i = 1; i < laid.lines.length; i++)
            expect(laid.lines[i]!.from).toBeGreaterThanOrEqual(laid.lines[i - 1]!.to);
    });

    it("a wrapped line starts at the wrapping word's own offset", () => {
        const text = "aaaa bbbb";
        const laid = layoutRuns(cx, leafForRuns(leaf(text)), 40);
        expect(laid.lines.length).toBe(2);
        expect(laid.lines[1]!.from).toBe(text.indexOf("bbbb"));
        expect(laid.lines[1]!.to).toBe(text.length);
    });

    it("hard breaks yield empty lines with collapsed ranges", () => {
        const laid = layoutRuns(cx, leafForRuns(leaf("a\n\nb")), 200);
        expect(laid.lines.length).toBe(3);
        expect(laid.lines[1]!.frags).toEqual([]);
        expect(laid.lines[1]!.from).toBe(laid.lines[1]!.to);
        expect(laid.lines[2]!.frags[0]!.text).toBe("b");
    });

    it("empty text is one empty line, one line-height tall", () => {
        const m = measure(leaf(""), 100);
        expect(m.lines).toHaveLength(1);
        expect(m.lines![0]).toMatchObject({ from: 0, to: 0, y: 0, width: 0, frags: [] });
        expect(m.lines![0]!.baseline).toBeCloseTo(11.6, 6);
        expect(m.height).toBe(16);
    });

    it("wrap:none splits only on hard breaks and reports the raw width", () => {
        const laid = layoutRuns(cx, leafForRuns(leaf("aaaa bbbb\ncc", { wrap: "none" })), 10);
        expect(laid.lines.length).toBe(2);
        expect(laid.width).toBe(9 * 8);
    });

    it("a plain leaf and its single-run twin wrap identically", () => {
        const text = "the quick brown fox jumps over it";
        const plain = layoutRuns(cx, leafForRuns(leaf(text)), 90);
        const runs = layoutRuns(cx, leaf(text, { runs: [{ text }] }), 90);
        expect(plain.lines.map((l) => [l.from, l.to, l.width])).toEqual(
            runs.lines.map((l) => [l.from, l.to, l.width]),
        );
        expect(plain.height).toBe(runs.height);
    });

    it("run boundaries inside a word keep per-frag offsets", () => {
        const laid = layoutRuns(
            cx,
            leaf("ab", { runs: [{ text: "a" }, { text: "b", bold: true }] }),
            200,
        );
        const frags = laid.lines[0]!.frags;
        expect(frags.map((f) => [f.text, f.from])).toEqual([
            ["a", 0],
            ["b", 1],
        ]);
    });
});
