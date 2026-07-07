import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { fitSlideContent } from "./backends";
import { measureText, layoutSlide } from "./commands";

// Deck slide geometry (16:9). Each section is stretched to fill the slide; taller content scales to fit.
export const SLIDE_W = 1280;
export const SLIDE_H = 720;

// Build one deck section as a self-contained 1280×720 slide element (content scaled to fit). Framework-
// free — shared by the studio's present overlay and the standalone present surface so neither re-derives
// slide geometry.
export function slideElement(
    section: Section,
    tokens: Tokens,
    profile: FormatDescriptor,
): HTMLDivElement {
    const { commands, height } = layoutSlide(
        section,
        SLIDE_W,
        SLIDE_H,
        measureText,
        tokens,
        profile,
    );
    const content = fitSlideContent(commands, height, SLIDE_W, SLIDE_H);
    const slide = document.createElement("div");
    slide.style.cssText = `position:relative;width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;background:${tokens.bg}`;
    slide.appendChild(content);
    return slide;
}
