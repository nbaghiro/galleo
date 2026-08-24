import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@model/theme";
import type { MeasureText, Rect, RenderCommand } from "@engine/node";
import { contrastRatio } from "@themes";
import { DEFAULT_THEME } from "@themes";
import { DEFAULT_PROFILE } from "@engine/profile";
import { layoutSection, layoutSlide } from "./commands";

// What a section only reveals once it has been laid out. Everything here needs the engine, so it
// cannot live in services (which may not import canvas) and is computed wherever the engine already
// runs — the app for a live run, a script for a batch.

export interface SectionFit {
    id: string;
    contentHeight: number;
    frameHeight: number | null; // null when the format grows to fit (doc, web)
    /** Pixels the content spills past a fixed frame; 0 when it fits or the frame is elastic. */
    overflow: number;
    /** Share of a fixed frame the content actually occupies; null when the frame is elastic. */
    fill: number | null;
    /**
     * What the slide path solves for this section: below 1, autofit re-composes it smaller to reach
     * the frame. `overflow` above stays the NATURAL, pre-fit spill on purpose, so the generation
     * signal survives; this says how much of it the renderer absorbs.
     */
    fitScale: number;
    /** The worst WCAG contrast ratio any text hits against what sits behind it; null if no text. */
    minContrast: number | null;
    /** Distinct left edges among the text; a ragged left reads as sloppy however good the copy is. */
    leftEdges: number;
    /** Distinct font sizes; past a handful this is noise rather than hierarchy. */
    typeSizes: number;
}

// AA for large text. Body would be 4.5, but headline-scale type on a scrim is the common case here
// and holding everything to 4.5 flags designs that read perfectly well.
export const CONTRAST_FLOOR = 3;

// A deliberate grid has few left edges; every extra one is a decision the eye has to absorb. Both of
// these are set to the hand-built corpus's own worst case (7 edges, 6 sizes), so the bar passes and
// only something worse than our best work trips them. Re-measure before tightening either.
export const MAX_LEFT_EDGES = 7;
export const MAX_TYPE_SIZES = 6;

/** Colours that are not plain hex (gradients, css vars) tell us nothing, so they are skipped. */
const hex = (c: string | undefined): string | null => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null);

// A slide that fills under a fifth of its frame reads as an accident rather than as breathing room.
// Measured, not guessed: captured through real Chromium (`pnpm eval:shots`), the hand-built corpus
// bottoms out at 26% on deliberately spacious statement slides, so a third flagged seven of them.
// Anything under a fifth is past what our own best work does on purpose.
export const SPARSE_BELOW = 0.2;

export function diagnoseSection(
    section: Section,
    width: number,
    measure: MeasureText,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
): SectionFit {
    const { commands, height } = layoutSection(section, width, measure, theme, format);
    // an elastic format has no frame to overflow: the page grows instead
    const frame = typeof format.height === "number" ? format.height : null;
    // the profile's frame is authored at its own width, so compare in the same aspect
    const base = typeof format.width === "number" ? format.width : null;
    const scaled = frame !== null && base ? frame * (width / base) : frame;
    return {
        id: section.id,
        contentHeight: height,
        frameHeight: scaled,
        overflow: scaled === null ? 0 : Math.max(0, height - scaled),
        fill: scaled ? height / scaled : null,
        fitScale:
            scaled === null || height <= scaled
                ? 1
                : layoutSlide(section, width, scaled, measure, theme, format).fitScale,
        ...typography(commands, theme),
    };
}

/**
 * The three things a still image of a section shows immediately and a word count never does: whether
 * the text can be read, whether it lines up, and whether the type scale is a hierarchy or a pile.
 */
function typography(
    commands: RenderCommand[],
    theme: Tokens,
): Pick<SectionFit, "minContrast" | "leftEdges" | "typeSizes"> {
    const texts = commands.filter(
        (c): c is Extract<RenderCommand, { kind: "text" }> =>
            c.kind === "text" && !!c.text.text.trim(),
    );
    if (!texts.length) return { minContrast: null, leftEdges: 0, typeSizes: 0 };

    // Whatever was painted last beneath this text is what it actually sits on: a chip's own fill for
    // a button label, the page otherwise. An image or a gradient is unjudgeable without sampling
    // pixels, so those stand down rather than guess.
    const covers = (r: Rect, box: Rect): boolean =>
        r.x <= box.x + 1 &&
        r.y <= box.y + 1 &&
        r.x + r.w >= box.x + box.w - 1 &&
        r.y + r.h >= box.y + box.h - 1;

    const behind = (box: Rect): string | null => {
        for (let i = commands.length - 1; i >= 0; i--) {
            const c = commands[i]!;
            if (!covers(c.box, box)) continue;
            if (c.kind === "image") return null; // photography behind text: not ours to judge
            if (c.kind === "surface") return null; // a gradient or scrim, same
            if (c.kind === "rect") {
                if (c.fill?.gradient) return null;
                const flat = hex(c.fill?.color);
                if (flat) return flat;
            }
        }
        return hex(theme.bg);
    };

    let minContrast: number | null = null;
    for (const t of texts) {
        const fg = hex(t.text.color) ?? hex(theme.ink);
        const bg = behind(t.box);
        if (!fg || !bg) continue; // an image or gradient behind it: not ours to judge here
        const ratio = contrastRatio(fg, bg);
        minContrast = minContrast === null ? ratio : Math.min(minContrast, ratio);
    }

    return {
        minContrast,
        leftEdges: new Set(texts.map((t) => Math.round(t.box.x))).size,
        typeSizes: new Set(texts.map((t) => Math.round(t.text.size))).size,
    };
}

export const diagnoseSections = (
    sections: readonly Section[],
    width: number,
    measure: MeasureText,
    theme?: Tokens,
    format?: FormatDescriptor,
): SectionFit[] => sections.map((s) => diagnoseSection(s, width, measure, theme, format));
