import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { fitSlideContent } from "./backends";
import { sectionSlides } from "./commands";

// fallback frame; per-section sizing flows through slideFrame / sectionSlides
export const SLIDE_W = 1280;
export const SLIDE_H = 720;

export function sectionSlideCount(
    section: Section,
    tokens: Tokens,
    profile: FormatDescriptor,
): number {
    return sectionSlides(section, tokens, profile).length;
}

// page is 0-based
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
