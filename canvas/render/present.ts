import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { slideFrame } from "@engine/profile";
import { fitSlideContent } from "./backends";
import { measureText, layoutSlide } from "./commands";

// Deck slide geometry (16:9 default). Each section is stretched to fill its frame; taller content scales to
// fit. Kept as the fallback frame; per-section sizing flows through `slideFrame`.
export const SLIDE_W = 1280;
export const SLIDE_H = 720;

// Build one paged section as a self-contained slide element (content scaled to fit its frame). The frame is
// resolved from the format + the section's own aspect override (`slideFrame`), so a deck can mix 16:9 and
// custom-aspect sections. Framework-free — shared by the studio's present overlay, the standalone present
// surface, and export, so none of them re-derive slide geometry.
export function slideElement(
    section: Section,
    tokens: Tokens,
    profile: FormatDescriptor,
): HTMLDivElement {
    const { w, h } = slideFrame(section, profile);
    const { commands, height } = layoutSlide(section, w, h, measureText, tokens, profile);
    const content = fitSlideContent(commands, height, w, h);
    const slide = document.createElement("div");
    slide.style.cssText = `position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${tokens.bg}`;
    slide.appendChild(content);
    return slide;
}
