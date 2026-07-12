import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { fitSlideContent } from "./backends";
import { sectionSlides } from "./commands";

// Deck slide geometry (16:9 default). Kept as the fallback frame; per-section sizing flows through
// `slideFrame`, and multi-slide pagination of tall sections through `sectionSlides`.
export const SLIDE_W = 1280;
export const SLIDE_H = 720;

// How many 16:9 slides a section spans in a paged deck (1, or several for a tall paginated section).
export function sectionSlideCount(
    section: Section,
    tokens: Tokens,
    profile: FormatDescriptor,
): number {
    return sectionSlides(section, tokens, profile).length;
}

// Build one paged slide element for page `page` of a section (0-based). A short/medium section has a single
// page (content scaled to fit its frame); a tall section paginates into several full-size 16:9 windows.
// Framework-free — shared by the studio's present overlay, the standalone present surface, and export, so
// none of them re-derive slide geometry.
export function slideElement(
    section: Section,
    tokens: Tokens,
    profile: FormatDescriptor,
    page = 0,
): HTMLDivElement {
    const pages = sectionSlides(section, tokens, profile);
    const p = pages[Math.min(Math.max(0, page), pages.length - 1)]!;
    const slide = document.createElement("div");
    slide.style.cssText = `position:relative;width:${p.w}px;height:${p.h}px;overflow:hidden;background:${tokens.bg}`;
    slide.appendChild(fitSlideContent(p.commands, p.contentH, p.w, p.h));
    return slide;
}
