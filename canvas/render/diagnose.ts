import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@model/theme";
import type { MeasureText } from "@engine/node";
import { DEFAULT_THEME } from "@themes";
import { DEFAULT_PROFILE } from "@engine/profile";
import { layoutSection } from "./commands";

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
}

// A slide that fills under a third of its frame reads as an accident rather than as breathing room.
export const SPARSE_BELOW = 0.33;

export function diagnoseSection(
    section: Section,
    width: number,
    measure: MeasureText,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
): SectionFit {
    const { height } = layoutSection(section, width, measure, theme, format);
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
    };
}

export const diagnoseSections = (
    sections: readonly Section[],
    width: number,
    measure: MeasureText,
    theme?: Tokens,
    format?: FormatDescriptor,
): SectionFit[] => sections.map((s) => diagnoseSection(s, width, measure, theme, format));
