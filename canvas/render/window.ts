import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import { slideFrame } from "@engine/profile";
import { sectionLayoutWidth } from "./backends";
import type { StackWindow } from "./backends";

// The arithmetic behind windowed rendering, kept pure so it can be reasoned about (and tested) without
// a scroller: which slice of the stage to materialize, and how much room a section that hasn't loaded
// yet should hold open.

/** Viewports of slack painted above and below the visible band, so fast scrolling stays ahead of the eye. */
export const OVERSCAN = 1.5;

export function stackWindow(
    scrollTop: number,
    viewportH: number,
    overscan = OVERSCAN,
): StackWindow {
    const slack = Math.max(0, viewportH * overscan);
    return { top: scrollTop - slack, bottom: scrollTop + viewportH + slack };
}

/** True once the window has moved far enough to be worth a repaint (a third of a viewport). */
export function windowMoved(a: StackWindow | null, b: StackWindow, viewportH: number): boolean {
    if (!a) return true;
    const step = Math.max(120, viewportH / 3);
    return Math.abs(a.top - b.top) >= step || Math.abs(a.bottom - b.bottom) >= step;
}

// Bytes-per-pixel is a crude but stable relationship for continuous formats: prose sections carry more
// text per pixel than media ones, and both land inside the clamp. Paged formats don't need it at all —
// a slide's height is its frame.
const BODY_BASE = 260;
const BYTES_PER_PX = 4;
const MIN_H = 220;
const MAX_H = 1600;

/**
 * Height to reserve for a section whose content hasn't arrived. `size` is the serialized byte count the
 * digest recorded; without it we fall back to a plain body-sized block.
 */
export function estimateSectionHeight(
    section: Section,
    profile: FormatDescriptor,
    fullW: number,
    size?: number,
): number {
    if (profile.kind === "paged") {
        const frame = slideFrame(section, profile);
        const w = sectionLayoutWidth(section, profile, fullW);
        return Math.round((w * frame.h) / frame.w);
    }
    const guess = BODY_BASE + (size ?? 0) / BYTES_PER_PX;
    return Math.round(Math.max(MIN_H, Math.min(MAX_H, guess)));
}
