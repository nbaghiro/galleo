import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import { sectionFrame } from "@engine/profile";
import { sectionLayoutWidth } from "./backends";
import type { StackWindow } from "./backends";

/** Viewports of slack painted above and below the visible band. */
export const OVERSCAN = 1.5;

export function stackWindow(
    scrollTop: number,
    viewportH: number,
    overscan = OVERSCAN,
): StackWindow {
    const slack = Math.max(0, viewportH * overscan);
    return { top: scrollTop - slack, bottom: scrollTop + viewportH + slack };
}

/** Movement per millisecond above which the viewer is flinging rather than reading. */
export const FLING_SPEED = 0.3;

export interface Slot {
    id: string;
    top: number;
    bottom: number;
    pending: boolean;
}

/**
 * Everything on screen (nearest the middle of the view first), then a lead in the direction of travel.
 * `max` bounds the lead, not the view: a fling must not queue one request per section it passed, but
 * nothing visible may be left as a stand-in because a limit ran out.
 */
export function planSectionRequests(opts: {
    slots: Slot[];
    view: StackWindow;
    lead: number; // how far past the view to prefetch; signed by direction of travel
    max: number; // cap on the prefetch tail
}): string[] {
    const { view, lead, max } = opts;
    const mid = (view.top + view.bottom) / 2;
    const ahead: StackWindow =
        lead >= 0
            ? { top: view.top, bottom: view.bottom + lead }
            : { top: view.top + lead, bottom: view.bottom };
    const visible: { id: string; d: number }[] = [];
    const prefetch: { id: string; d: number }[] = [];
    for (const s of opts.slots) {
        if (!s.pending) continue;
        if (s.top >= ahead.bottom || s.bottom <= ahead.top) continue;
        const d = Math.abs((s.top + s.bottom) / 2 - mid);
        (s.top < view.bottom && s.bottom > view.top ? visible : prefetch).push({ id: s.id, d });
    }
    const near = (a: { d: number }, b: { d: number }): number => a.d - b.d;
    return [
        ...visible.sort(near).map((s) => s.id),
        ...prefetch
            .sort(near)
            .slice(0, Math.max(0, max))
            .map((s) => s.id),
    ];
}

/** True when the visible band holds nothing but placeholders — worth fetching without settling. */
export function viewIsCold(slots: Slot[], view: StackWindow): boolean {
    let seen = false;
    for (const s of slots) {
        if (s.top >= view.bottom || s.bottom <= view.top) continue;
        if (!s.pending) return false;
        seen = true;
    }
    return seen;
}

/** True once the window has moved far enough to be worth a repaint (a third of a viewport). */
export function windowMoved(a: StackWindow | null, b: StackWindow, viewportH: number): boolean {
    if (!a) return true;
    const step = Math.max(120, viewportH / 3);
    return Math.abs(a.top - b.top) >= step || Math.abs(a.bottom - b.bottom) >= step;
}

// Crude bytes-per-pixel guess for continuous formats; a paged section's height is its frame.
const BODY_BASE = 260;
const BYTES_PER_PX = 4;
const MIN_H = 220;
const MAX_H = 1600;

/** Height to reserve for a section whose content hasn't arrived; `size` is the digest's byte count. */
export function estimateSectionHeight(
    section: Section,
    profile: FormatDescriptor,
    fullW: number,
    size?: number,
): number {
    if (profile.kind === "paged") {
        const frame = sectionFrame(section, profile);
        const w = sectionLayoutWidth(section, profile, fullW);
        return Math.round((w * frame.h) / frame.w);
    }
    const guess = BODY_BASE + (size ?? 0) / BYTES_PER_PX;
    return Math.round(Math.max(MIN_H, Math.min(MAX_H, guess)));
}
