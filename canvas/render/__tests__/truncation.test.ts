// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TextLeaf } from "@engine/node";
import { clearMeasureCache, layoutRuns, leafForRuns, measureText } from "@canvas/render/commands";
import { installCanvas2D, textMetricsCtx } from "@canvas/testkit";
import { beforeAll } from "vitest";

beforeAll(installCanvas2D);

const cx = textMetricsCtx();
const leaf = (text: string, extra?: Partial<TextLeaf>): TextLeaf => ({
    text,
    fontId: "f",
    size: 12,
    lineHeight: 16,
    wrap: "words",
    ...extra,
});

describe("maxLines truncation", () => {
    it("clamps the height and line count", () => {
        const long = leaf("aaaa bbbb cccc dddd eeee", { maxLines: 2 });
        const laid = layoutRuns(cx, leafForRuns(long), 40);
        expect(laid.lines.length).toBe(2);
        expect(laid.height).toBe(32);
    });

    it("does nothing when the text already fits", () => {
        const short = leaf("aaaa", { maxLines: 3 });
        const laid = layoutRuns(cx, leafForRuns(short), 200);
        expect(laid.lines.length).toBe(1);
        expect(laid.lines[0]!.frags.some((f) => f.text === "…")).toBe(false);
    });

    it("ends the last kept line with an ellipsis that fits the width", () => {
        const long = leaf("aaaa bbbb cccc dddd", { maxLines: 1 });
        const laid = layoutRuns(cx, leafForRuns(long), 40);
        const last = laid.lines[0]!;
        const ell = last.frags[last.frags.length - 1]!;
        expect(ell.text).toBe("…");
        expect(last.width).toBeLessThanOrEqual(40);
    });

    it("the ellipsis inherits font and color but never link or decorations", () => {
        const long = leaf("linked text that runs long", {
            maxLines: 1,
            runs: [
                {
                    text: "linked text that runs long",
                    link: "https://x.y",
                    underline: true,
                    color: "#ff0000",
                },
            ],
        });
        const laid = layoutRuns(cx, long, 60);
        const ell = laid.lines[0]!.frags.at(-1)!;
        expect(ell.text).toBe("…");
        expect(ell.color).toBe("#ff0000");
        expect(ell.link).toBeUndefined();
        expect(ell.underline).toBe(false);
    });

    it("clip mode trims without an ellipsis", () => {
        const long = leaf("aaaa bbbb cccc", { maxLines: 1, overflow: "clip" });
        const laid = layoutRuns(cx, leafForRuns(long), 40);
        expect(laid.lines.length).toBe(1);
        expect(laid.lines[0]!.frags.some((f) => f.text === "…")).toBe(false);
    });

    it("offsets stay total: the ellipsis carries the cut offset", () => {
        const text = "aaaa bbbb cccc";
        const laid = layoutRuns(cx, leafForRuns(leaf(text, { maxLines: 1 })), 48);
        const last = laid.lines[0]!;
        const ell = last.frags.at(-1)!;
        expect(ell.from).toBe(last.to);
        expect(last.to).toBeLessThanOrEqual(text.length);
    });

    it("the measure key separates clamped from unclamped", () => {
        clearMeasureCache();
        const a = measureText(leaf("aaaa bbbb cccc dddd eeee"), 40);
        const b = measureText(leaf("aaaa bbbb cccc dddd eeee", { maxLines: 2 }), 40);
        expect(a.height).toBeGreaterThan(b.height);
    });

    it("a warm cache answers exactly like a cold one", () => {
        const l = leaf("aaaa bbbb cccc dddd", { maxLines: 2 });
        clearMeasureCache();
        const cold = measureText(l, 40);
        const warm = measureText(l, 40);
        expect(warm).toEqual(cold);
        clearMeasureCache();
        expect(measureText(l, 40)).toEqual(cold);
    });
});
