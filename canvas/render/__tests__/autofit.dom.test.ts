// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { MeasureText, RenderCommand } from "@engine/node";
import type { FormatDescriptor } from "@model/geometry";
import {
    layoutSection,
    layoutSlide,
    measureText,
    sectionSlides,
    solveFitScale,
} from "@canvas/render/commands";
import { fitSectionToFrame } from "@canvas/render/fit";
import { FIT_FLOOR, MIN_TEXT_PX, resolveProfile } from "@engine/profile";
import type { ElementInstance, Section } from "@model/artifact";
import { colGroup } from "@model/artifact";
import { inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";

beforeAll(() => installCanvas2D());

const deck = resolveProfile("deck");
const fitFormat: FormatDescriptor = { ...deck, id: "card", overflow: "fit" };
const W = 1280;
const H = 720;

const para = (i: number, words = 6): string =>
    `Paragraph ${i}: ${"lorem ipsum dolor sit amet consectetur ".repeat(words)}`;

const bodyChildren = (n: number, words = 6): ElementInstance[] => [
    inst("text", { style: "h1", text: "A title that runs on" }),
    ...Array.from({ length: n }, (_, i) => inst("text", { style: "body", text: para(i, words) })),
];

const body = (n: number, words = 6): Section => sectionOf(colGroup(bodyChildren(n, words)));

const short = sectionOf(colGroup([inst("text", { style: "h1", text: "Just a title" })]));

// one dominant photo with more caption than a slide holds: cover-fit's own probe fails, and
// shrinking the text is what unblocks it
const photoEssay = sectionOf(
    colGroup([
        inst("image", { src: "dune.png" }),
        ...Array.from({ length: 11 }, (_, i) => inst("text", { style: "body", text: para(i, 4) })),
    ]),
);

const smallestText = (r: { commands: RenderCommand[] }): number =>
    r.commands.reduce(
        (m, c) => (c.kind === "text" && c.text.text.trim() ? Math.min(m, c.text.size) : m),
        Infinity,
    );

const slide = (section: Section, format = deck): ReturnType<typeof layoutSlide> =>
    layoutSlide(section, W, H, measureText, tokens, format);

describe("solveFitScale", () => {
    // H(f) = A·f² + B·f + C, the shape the doc derives: text, then space, then scale-free media
    const model =
        (a: number, b: number, c: number) =>
        (f: number): number =>
            a * f * f + b * f + c;

    it("returns the largest fitting scale, snapped down onto the 0.02 grid", () => {
        const h = model(900, 200, 0);
        const { f } = solveFitScale(720, h(1), FIT_FLOOR, h);
        expect(h(f)).toBeLessThanOrEqual(720);
        expect(Math.round(f * 50)).toBeCloseTo(f * 50, 6); // on the grid
        expect(f).toBeGreaterThan(0.7);
        expect(h(f + 0.04)).toBeGreaterThan(720); // and it is not leaving room behind
    });

    it("spends at most four probes, counting the f = 1 the caller already did", () => {
        let calls = 0;
        const h = model(1400, 260, 40);
        const { probes } = solveFitScale(720, h(1), FIT_FLOOR, (f) => {
            calls++;
            return h(f);
        });
        expect(probes).toBeLessThanOrEqual(4);
        expect(calls).toBe(probes - 1);
    });

    it("returns 1 when even the floor overflows, rather than a scale that does not fit", () => {
        const h = model(2600, 400, 0); // ~4x the frame
        const { f, probes } = solveFitScale(720, h(1), FIT_FLOOR, h);
        expect(f).toBe(1);
        expect(probes).toBeLessThanOrEqual(4);
    });

    it("never answers below the floor it is given", () => {
        const h = model(1200, 300, 100);
        const { f } = solveFitScale(720, h(1), 0.9, h);
        expect(f === 1 || f >= 0.9).toBe(true);
    });

    it("stops early on a probe that all but fills the frame", () => {
        const h = model(800, 0, 0); // the seed lands at 0.94, which fills 98% of the frame
        const { probes } = solveFitScale(720, h(1), FIT_FLOOR, h);
        expect(probes).toBe(2);
    });
});

describe("autofit in the slide chain", () => {
    it("a section that already fits is left at its authored size", () => {
        const r = slide(short);
        expect(r.fitScale).toBe(1);
        expect(r.height).toBe(H);
    });

    it("costs a section that fits no extra layout pass", () => {
        let slideCalls = 0;
        let plainCalls = 0;
        const counting =
            (count: () => void): MeasureText =>
            (leaf, maxW) => {
                count();
                return measureText(leaf, maxW);
            };
        layoutSection(
            short,
            W,
            counting(() => plainCalls++),
            tokens,
            deck,
        );
        layoutSlide(
            short,
            W,
            H,
            counting(() => slideCalls++),
            tokens,
            deck,
        );
        // compose + one probe + the final layout: exactly twice the plain path, so no probe was spent
        expect(slideCalls).toBe(plainCalls * 2);
    });

    it("fits an overflowing text section by re-composing it smaller", () => {
        const r = slide(body(10));
        expect(r.fitScale).toBeLessThan(1);
        expect(r.fitScale).toBeGreaterThanOrEqual(FIT_FLOOR);
        expect(r.height).toBe(H);
    });

    it("keeps the full width, so smaller type buys longer lines rather than a smaller copy", () => {
        const fitted = slide(body(10));
        const natural = slide(short);
        const widest = (cmds: typeof fitted.commands): number =>
            cmds.reduce((m, c) => Math.max(m, c.box.x + c.box.w), 0);
        expect(widest(fitted.commands)).toBeGreaterThan(widest(natural.commands) * 0.9);
    });

    it("holds the floor against the section's smallest type, not its average", () => {
        // A format that never paginates is where deep scales are reachable: on a deck the search
        // stops at PAGINATE_ABOVE, so it rarely gets near the floor at all.
        const plain = slide(body(14), fitFormat);
        const labelled = slide(
            sectionOf(
                colGroup([
                    inst("text", { style: "label", text: "Section label" }),
                    ...bodyChildren(14),
                ]),
            ),
            fitFormat,
        );
        expect(plain.fitScale).toBeLessThan(1);
        expect(smallestText(plain)).toBeGreaterThanOrEqual(MIN_TEXT_PX);
        // The one 13px label is the whole difference: the same content fits at 0.72 without it, and
        // 0.72 would paint that label at 9px. An average-sized floor would have allowed it.
        expect(labelled.fitScale).toBe(1);
        expect(plain.fitScale).toBeLessThan(MIN_TEXT_PX / 13);
    });

    it("leaves a media section on the cover-fit path", () => {
        const photo = sectionOf(
            colGroup([
                inst("image", { src: "dune.png" }),
                inst("text", {
                    style: "body",
                    text: "Gion, 5:48. The teahouse lanterns are dark, the cobbles wet from a rain that came and went.",
                }),
            ]),
        );
        const r = slide(photo);
        expect(r.fitScale).toBe(1); // the photo absorbed the slack; no type was shrunk
        expect(r.height).toBe(H);
        const tallest = Math.max(
            ...r.commands.filter((c) => c.kind === "image").map((c) => c.box.h),
        );
        expect(tallest).toBeGreaterThan(100);
    });

    it("shrinks the text so a photo can absorb the rest when it could not before", () => {
        const r = slide(photoEssay);
        expect(r.height).toBe(H);
        expect(r.fitScale).toBeLessThan(1);
        // the media is still holding the slack open, which is what the plain search cannot do
        expect(r.commands.some((c) => c.kind === "image" && c.box.h > 0)).toBe(true);
        expect(smallestText(r)).toBeLessThan(17);
    });

    it("leaves a section headed for pagination at full size", () => {
        const tall = body(40, 10); // ~3.6x the frame
        expect(slide(tall).fitScale).toBe(1);
        expect(sectionSlides(tall, tokens, deck).length).toBeGreaterThan(1);
    });

    it("searches anyway for a format that never paginates, however tall", () => {
        const tall = body(40, 10);
        const pages = sectionSlides(tall, tokens, fitFormat);
        expect(pages).toHaveLength(1);
        expect(pages[0]!.fitScale).toBe(1); // no scale reaches the frame, so the caller still scales
        // one that autofit CAN reach is fitted rather than handed back for a pixel scale
        expect(sectionSlides(body(10), tokens, fitFormat)[0]!.fitScale).toBeLessThan(1);
    });

    it("never applies on a continuous format, which has no frame to fit", () => {
        const doc = resolveProfile("doc");
        const r = layoutSection(body(10), W, measureText, tokens, doc);
        expect(r.height).toBeGreaterThan(0);
        // the slide chain is the only caller of the search; layoutSection has no fit scale at all
        expect("fitScale" in r).toBe(false);
    });

    it("reports the same scale to every consumer of the slide chain", () => {
        const s = body(10);
        expect(sectionSlides(s, tokens, deck)[0]!.fitScale).toBe(slide(s).fitScale);
    });

    it("holds a frozen scale instead of re-solving, and re-solves when it is dropped", () => {
        const s = body(10);
        const solved = slide(s).fitScale;
        const frozen = layoutSlide(s, W, H, measureText, tokens, deck, false, 1);
        expect(frozen.fitScale).toBe(1);
        expect(frozen.height).toBeGreaterThan(H); // held at its authored size, so it spills
        expect(layoutSlide(s, W, H, measureText, tokens, deck).fitScale).toBe(solved);
    });
});

describe("fitSectionToFrame inherits the fit", () => {
    // Its asPageOrGiveUp branch calls layoutSlide, so it picks this up with no change of its own.
    it("translates a section that only reaches the frame once its type shrinks", () => {
        const f = fitSectionToFrame(photoEssay, { w: W, h: H }, measureText, tokens, deck);
        expect(f.exact).toBe(true);
        expect(f.layoutW).toBe(W); // the paged branch, not a solved width
        expect(f.contentH).toBe(H);
        const sizes = f.commands.flatMap((c) => (c.kind === "text" ? [c.text.size] : []));
        expect(Math.max(...sizes)).toBeLessThan(44); // composed smaller than the authored scale
    });
});
