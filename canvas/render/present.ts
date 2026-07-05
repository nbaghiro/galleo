import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes/theme";
import { fitSlideContent } from "./backends";
import { measureText, layoutSlide } from "./commands";
import { pagedSize } from "@engine/profile";

// Deck-default page geometry (fallback only); the real page size comes from the profile via pagedSize().
export const SLIDE_W = 1280;
export const SLIDE_H = 720;

// Build one section as a self-contained page element at the profile's size (content scaled to fit).
// Framework-free — shared by the studio's present overlay and the standalone present surface so neither
// re-derives page geometry. Deck → 1280×720; flex → the artifact's custom page size.
export function slideElement(
    section: Section,
    tokens: Tokens,
    profile: FormatDescriptor,
): HTMLDivElement {
    const { w, h } = pagedSize(profile);
    const { commands, height } = layoutSlide(section, w, h, measureText, tokens, profile);
    const content = fitSlideContent(commands, height, w, h);
    const slide = document.createElement("div");
    slide.style.cssText = `position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${tokens.bg}`;
    slide.appendChild(content);
    return slide;
}
