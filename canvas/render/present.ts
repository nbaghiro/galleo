import type { Region, RenderCommand } from "@engine/node";
import { rotateRegion } from "@engine/layout";
import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { fitSlideContent } from "./backends";
import { sectionSlides } from "./commands";

// fallback frame; per-section sizing flows through sectionFrame / sectionSlides
export const SLIDE_W = 1280;
export const SLIDE_H = 720;

export function sectionSlideCount(
    section: Section,
    tokens: Tokens,
    profile: FormatDescriptor,
): number {
    return sectionSlides(section, tokens, profile).length;
}

/** Where a flat slide index falls: which section, and which page within it. Both 0-based. */
export function locateSlide(counts: readonly number[], flat: number): { si: number; page: number } {
    let n = Math.max(0, flat);
    for (let i = 0; i < counts.length; i++) {
        if (n < counts[i]!) return { si: i, page: n };
        n -= counts[i]!;
    }
    const last = counts.length - 1;
    return { si: Math.max(0, last), page: Math.max(0, (counts[last] ?? 1) - 1) };
}

/** The flat index of a section's first page, for jumping to it from an overview or a track change. */
export function firstSlideOf(counts: readonly number[], si: number): number {
    let flat = 0;
    for (let i = 0; i < Math.min(si, counts.length); i++) flat += counts[i] ?? 1;
    return flat;
}

/**
 * One screenful of one section: a slide page in a paged format, a viewport-height chunk of the
 * stack in a continuous one. Narration plays one track per section and steps through that section's
 * screens at `ms / of` intervals, which is what lets both format kinds share a player.
 */
export interface Step {
    sectionId: string;
    within: number; // 0-based, within the section
    of: number;
    top?: number; // continuous only: the scroll offset this step sits at
}

export function pagedSteps(sectionIds: readonly string[], counts: readonly number[]): Step[] {
    const out: Step[] = [];
    sectionIds.forEach((sectionId, i) => {
        const of = Math.max(1, counts[i] ?? 1);
        for (let within = 0; within < of; within++) out.push({ sectionId, within, of });
    });
    return out;
}

/**
 * `tops` is each section's y offset from the last paint and `totalH` the painted height, so the last
 * section's height is measurable. A section shorter than the viewport is one step, which is the
 * common case and keeps a normal doc from being chopped up.
 */
export function continuousSteps(
    sectionIds: readonly string[],
    tops: readonly number[],
    totalH: number,
    viewportH: number,
): Step[] {
    if (viewportH <= 0) return sectionIds.map((sectionId) => ({ sectionId, within: 0, of: 1 }));
    const out: Step[] = [];
    sectionIds.forEach((sectionId, i) => {
        const top = tops[i] ?? 0;
        const height = Math.max(0, (tops[i + 1] ?? totalH) - top);
        const of = Math.max(1, Math.ceil(height / viewportH));
        for (let within = 0; within < of; within++)
            out.push({ sectionId, within, of, top: top + within * viewportH });
    });
    return out;
}

/** The first step of a section, which is where a track change or an overview jump lands. */
export function stepIndexOf(steps: readonly Step[], sectionId: string): number {
    const at = steps.findIndex((s) => s.sectionId === sectionId);
    return at < 0 ? 0 : at;
}

/**
 * How long one step of a section holds the screen, given its track. Even division: a three-page
 * section over a thirty-second track turns a page every ten seconds.
 */
export const stepHoldMs = (trackMs: number, of: number): number =>
    Math.max(1, Math.round(trackMs / Math.max(1, of)));

/**
 * Where a continuous surface scrolls to put a section under the reader: its painted top, less the
 * height of whatever is pinned above it. Every pinned layer sticks at the same offset, so the
 * tallest one above the target is what would otherwise cover the first line of it. Null when no
 * section carries the id, which is how a link to a deleted section stays inert.
 */
export function sectionScrollTop(
    sections: readonly { id: string; pinned?: boolean }[],
    tops: readonly number[],
    heights: readonly number[],
    id: string,
): number | null {
    const at = sections.findIndex((s) => s.id === id);
    if (at < 0) return null;
    let cover = 0;
    for (let i = 0; i < at; i++) if (sections[i]?.pinned) cover = Math.max(cover, heights[i] ?? 0);
    return Math.max(0, (tops[at] ?? 0) - cover);
}

/**
 * How far a pinned section has been carried below its own slot by the scroll. Overlays anchored to
 * the static layout (a live player, a popup trigger) have to follow the layer they sit on.
 */
export function pinnedShift(
    sections: readonly { id: string; pinned?: boolean }[],
    tops: readonly number[],
    scrollTop: number,
    sectionId: string,
): number {
    const at = sections.findIndex((s) => s.id === sectionId);
    if (at < 0 || !sections[at]?.pinned) return 0;
    return Math.max(0, scrollTop - (tops[at] ?? 0));
}

/**
 * Regions recovered from a page's commands. A paged render fragments and reframes commands rather
 * than carrying the layout's own region list, but each command still holds the id its node was
 * tagged with, which is everything an overlay needs to find its box.
 */
export function commandRegions(commands: RenderCommand[]): Region[] {
    const byId = new Map<string, Region>();
    for (const c of commands) {
        if (!c.id) continue;
        const radius =
            c.kind === "rect" ? c.fill?.radius : c.kind === "image" ? c.image.radius : undefined;
        const seen = byId.get(c.id);
        const flat: Region = { id: c.id, box: c.box, radius };
        if (!seen) byId.set(c.id, c.rotate ? rotateRegion(flat, c.rotate) : flat);
        else if (seen.radius === undefined && radius !== undefined) seen.radius = radius;
    }
    return [...byId.values()];
}

// page is 0-based; `content` is the scaled host the commands were painted into, so an overlay
// mounted there inherits both of the slide's transforms
export function slideElement(
    section: Section,
    tokens: Tokens,
    profile: FormatDescriptor,
    page = 0,
): {
    el: HTMLDivElement;
    content: HTMLDivElement;
    commands: RenderCommand[];
    nodes: HTMLElement[];
    regions: Region[];
} {
    const pages = sectionSlides(section, tokens, profile);
    const p = pages[Math.min(Math.max(0, page), pages.length - 1)]!;
    const slide = document.createElement("div");
    // flex-shrink:0 — a shrunk slide would then be scaled again by the transform
    slide.style.cssText = `position:relative;flex-shrink:0;width:${p.w}px;height:${p.h}px;overflow:hidden;background:${tokens.bg}`;
    const content = fitSlideContent(p.commands, p.contentH, p.w, p.h);
    slide.appendChild(content.el);
    return {
        el: slide,
        content: content.el,
        commands: p.commands,
        nodes: content.nodes,
        regions: commandRegions(p.commands),
    };
}
