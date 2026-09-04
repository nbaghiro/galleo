import { resolveProfile } from "@engine/profile";
import type { Tier } from "@ui/viewport";

// Horizontal breathing room either side of a frame. Must stay in sync with the Board's px-* classes.
const INSET: Record<Tier, number> = { phone: 24, tablet: 48, desktop: 48 };

// Narrower than this and the engine's own stacking stops saving us.
const MIN_FRAME: Record<Tier, number> = { phone: 280, tablet: 320, desktop: 320 };

export function frameWidthFor(avail: number, formatId: string, tier: Tier): number {
    const p = resolveProfile(formatId);
    const inner = avail - INSET[tier];
    // web bleeds to fill; the paged and doc profiles keep their reading cap
    const capped = p.id === "web" ? inner : Math.min(inner, p.maxContentWidth ?? 1080);
    return Math.max(MIN_FRAME[tier], capped);
}

// A phone has no room for two columns, so the console takes the whole body and the board hides
// behind it rather than shrinking.
export type RailMode = "beside" | "switched";

export const railMode = (tier: Tier): RailMode => (tier === "phone" ? "switched" : "beside");

// Whether a still-unwritten beat accepts edits. Writing one section parks the run at stage
// "writing" (paused), so gating on stage === "outlined" silently stripped the controls and inline
// editing from every beat that had not been written yet. Only a locked run freezes the board.
const EDITABLE_STAGES = new Set(["outlined", "writing", "done"]);

export const outlineEditable = (stage: string, runLocked: boolean): boolean =>
    !runLocked && EDITABLE_STAGES.has(stage);

// Which painted region a tap lands in. Regions nest (a point sits inside its bullet list), so the
// smallest hit wins, else every tap would resolve to the outermost box.
export function hitRegion<T extends { box: { x: number; y: number; w: number; h: number } }>(
    hits: T[],
    x: number,
    y: number,
): T | null {
    let best: T | null = null;
    for (const h of hits) {
        const b = h.box;
        if (x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h) continue;
        if (!best || b.w * b.h < best.box.w * best.box.h) best = h;
    }
    return best;
}
