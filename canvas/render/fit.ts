import type { Section } from "@model/artifact";
import type { MeasureText, RenderCommand } from "@engine/node";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { layoutSection, layoutSlide } from "./commands";

// Rendering a section at a shape that is not its own.
//
// A section has no intrinsic aspect ratio: it is a flow, so its height is a function of width, H(W).
// "Does this fit 16:9" is therefore the wrong question — the right one is "at what width does this
// BECOME 16:9". Solve H(W)/W = frame.h/frame.w and the content fills the frame with no crop, no
// letterbox and no distortion.
//
// H(W) is non-increasing (wider ⇒ fewer wrapped lines), so H(W)/W strictly decreases and there is at
// most one crossing. Text-dominated content also roughly conserves area (H·W ≈ A), which gives a
// closed-form second probe rather than a blind search: usually 2–3 layouts, and exactly one when the
// section already matches its frame (every deck slide).
//
// Use this only for a view at a different shape — thumbnails, format translation. NOT for presenting or
// exporting an artifact in its own format: a deck slide is canonically 1280 wide, and reflowing it would
// change the line breaks the author sees, breaking "what you edit is what ships".

export interface FittedSection {
    commands: RenderCommand[];
    layoutW: number; // the width solved for
    contentH: number; // natural height at that width
    exact: boolean; // false ⇒ content does not reflow into this shape; caller should letterbox
    probes: number; // layouts spent, for tests and budgeting
}

const MAX_PROBES = 6;
// Wrapping is a step function: H jumps by a line-height as breaks change, so the crossing often falls
// INSIDE a jump and no width matches exactly. 5% off the frame is ~2% margin per edge — invisible at
// thumbnail scale — and stopping there saves probes we could never spend usefully.
const TOL = 0.05;
const MIN_FACTOR = 1 / 8; // never solve outside this band around the frame width
const MAX_FACTOR = 8;
// How steeply the aspect falls with width, in log-log terms. Reflowing text sits near -1.8; content
// that cannot reflow (a photo, a width-capped column) sits near 0 and will never reach any target.
const MIN_SLOPE = 0.5;

interface Probe {
    w: number;
    h: number;
    commands: RenderCommand[];
}

export function fitSectionToFrame(
    section: Section,
    frame: { w: number; h: number },
    measure: MeasureText,
    theme: Tokens,
    format: FormatDescriptor,
    plain = false,
): FittedSection {
    const target = frame.h / frame.w;
    const lowest = Math.round(frame.w * MIN_FACTOR);
    const highest = Math.round(frame.w * MAX_FACTOR);
    const clamp = (w: number): number => Math.round(Math.min(highest, Math.max(lowest, w)));

    let probes = 0;
    const at = (w: number): Probe => {
        probes++;
        const { commands, height } = layoutSection(section, w, measure, theme, format, plain);
        return { w, h: height, commands };
    };
    const ratio = (p: Probe): number => p.h / p.w;
    const err = (p: Probe): number => Math.abs(ratio(p) / target - 1);

    const done = (p: Probe, exact = err(p) <= TOL): FittedSection => ({
        commands: p.commands,
        layoutW: p.w,
        contentH: p.h,
        exact,
        probes,
    });

    // Reflowing alone cannot always reach the target. The usual cause is aspect-locked media: a photo's
    // height GROWS with width (h = colW/aspect), so once it dominates, H(W)/W flattens at a floor no
    // width can cross. The paged path solves exactly that — `coverFitMedia` lets a dominant photo absorb
    // the slack instead of holding its aspect — and when it succeeds the section takes the frame's
    // aspect exactly.
    //
    // But it only succeeds once the REST of the section fits the frame, and that is itself a function of
    // width: at a narrow width the text alone can be taller than the frame, leaving nothing for the
    // photo to absorb. So try it at a few widths, not just the canonical one. Widening shrinks the text
    // and grows the frame at the same time, so once it fits it keeps fitting.
    const asPageOrGiveUp = (first: Probe): FittedSection => {
        for (const mult of [1, 2, 4]) {
            const w = clamp(frame.w * mult);
            const h = w * target;
            probes++;
            const page = layoutSlide(section, w, h, measure, theme, format, plain);
            if (page.height <= h * (1 + TOL))
                return {
                    commands: page.commands,
                    layoutW: w,
                    contentH: page.height,
                    exact: true,
                    probes,
                };
            if (w === highest) break;
        }
        return done(first, false);
    };

    const first = at(frame.w);
    if (err(first) <= TOL) return done(first);

    // Area conservation (H·W ≈ A) puts the second probe near the crossing instead of guessing.
    const second = at(clamp(Math.sqrt((first.h * first.w) / target)));
    if (second.w === first.w) return asPageOrGiveUp(first); // clamped onto itself; nothing to search
    let best = err(second) < err(first) ? second : first;
    if (err(second) <= TOL) return done(second);

    // How fast the aspect responds to width tells us whether this content reflows at all.
    const slope =
        (Math.log(ratio(second)) - Math.log(ratio(first))) /
        (Math.log(second.w) - Math.log(first.w));
    if (!Number.isFinite(slope) || Math.abs(slope) < MIN_SLOPE) return asPageOrGiveUp(first);

    // `lo` is the narrow side (aspect above target), `hi` the wide side. Held in a record because a
    // closure assigning to plain `let` bindings defeats TypeScript's narrowing at the read sites.
    const bracket: { lo: Probe | null; hi: Probe | null } = { lo: null, hi: null };
    const place = (p: Probe): void => {
        if (ratio(p) > target) {
            if (!bracket.lo || p.w > bracket.lo.w) bracket.lo = p;
        } else if (!bracket.hi || p.w < bracket.hi.w) bracket.hi = p;
    };
    place(first);
    place(second);

    let last = second;
    while (probes < MAX_PROBES) {
        const { lo, hi } = bracket;
        // bracketed → geometric bisection (the aspect falls roughly as 1/W², so log-space halves it);
        // not yet → extrapolate along the measured slope toward the target
        const next = clamp(
            lo && hi
                ? Math.sqrt(lo.w * hi.w)
                : Math.exp(Math.log(last.w) + (Math.log(target) - Math.log(ratio(last))) / slope),
        );
        if (next === last.w) break;
        const p = at(next);
        if (err(p) < err(best)) best = p;
        if (err(p) <= TOL) return done(p);
        place(p);
        last = p;
        // collapsed onto a wrap jump — the crossing falls inside it, so `best` is all there is
        if (bracket.lo && bracket.hi && bracket.hi.w - bracket.lo.w <= 1) break;
        if (!bracket.lo && next === lowest) break; // no crossing inside the allowed band
        if (!bracket.hi && next === highest) break;
    }

    if (!bracket.lo || !bracket.hi) return asPageOrGiveUp(first); // never straddled the target
    return done(best);
}
