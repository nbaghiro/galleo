import type { LayoutCtx } from "@elements/element-spec";
import type { EngineNode, MeasureText } from "@engine/node";
import type { Region, RenderCommand } from "@engine/render-command";
import type { Section } from "@model/content";
import type { FormatDescriptor } from "@model/format";
import type { Tokens } from "@themes/theme";
import { composeSection } from "@elements/compose";
import { skeletonize } from "@elements/skeleton";
import { layout } from "@engine/layout";
import { DEFAULT_PROFILE } from "@engine/profile";
import { fixed } from "@model/size";
import { DEFAULT_THEME } from "@themes/library";
import { mix } from "@themes/color";

// Imperative bridge: kernel layout → render commands. Components paint these into refs; the engine
// stays the single source of geometry (the framework never lays out content).

export const SECTION_GAP = 22;

export function ctxFor(
    width: number,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
): LayoutCtx {
    return { box: { x: 0, y: 0, w: width, h: 0 }, availWidth: width, format, theme };
}

function bottom(commands: RenderCommand[]): number {
    return commands.reduce((m, c) => Math.max(m, c.box.y + c.box.h), 0);
}

export function layoutSection(
    section: Section,
    width: number,
    measure: MeasureText,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
): { commands: RenderCommand[]; regions: Region[]; height: number } {
    const node = composeSection(section, ctxFor(width, theme, format));
    const { commands, regions } = layout(node, { x: 0, y: 0, w: width, h: 100000 }, measure);
    return { commands, regions, height: bottom(commands) };
}

// theme-aware ghost palette for skeletons (dark on dark, etc.)
function ghostColorsFor(theme: Tokens): { bar: string; panel: string; line: string } {
    return { bar: mix(theme.surface, theme.ink, 0.2), panel: theme.surface, line: theme.line };
}

// The same section laid out as a structural ghost (the "generating" state). It composes the real
// section then skeletonizes the node tree, so the placeholder occupies the EXACT width/height/grid the
// finished section will — the live-build skeleton can't drift from the real geometry. Ghost tones are
// derived from the theme so it respects the active artifact theme (dark on dark, etc.).
export function layoutSectionSkeleton(
    section: Section,
    width: number,
    measure: MeasureText,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
): { commands: RenderCommand[]; height: number } {
    const node = skeletonize(
        composeSection(section, ctxFor(width, theme, format)),
        ghostColorsFor(theme),
    );
    const { commands } = layout(node, { x: 0, y: 0, w: width, h: 100000 }, measure);
    return { commands, height: bottom(commands) };
}

// Prepare a full-bleed slide node: drop corner radii/borders and stretch it to FILL the slide (content
// centered), so a short section sizes up to the whole frame; a section taller than the slide keeps its
// natural height (the caller scales it down). Returns the node + resolved height for a final layout pass.
function prepareSlideNode(
    section: Section,
    w: number,
    h: number,
    measure: MeasureText,
    theme: Tokens,
    format: FormatDescriptor,
): { node: EngineNode; targetH: number } {
    const node = composeSection(section, ctxFor(w, theme, format));
    if (node.fill) node.fill = { ...node.fill, radius: 0, border: undefined };
    if (node.image) node.image = { ...node.image, radius: 0 };
    const natural = bottom(layout(node, { x: 0, y: 0, w, h: 100000 }, measure).commands);
    const targetH = Math.max(h, natural);
    node.h = fixed(targetH);
    node.alignY = "center";
    return { node, targetH };
}

// A presentation slide: the section full-bleed, stretched to fill the frame (content centered).
export function layoutSlide(
    section: Section,
    w: number,
    h: number,
    measure: MeasureText,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
): { commands: RenderCommand[]; height: number } {
    const { node, targetH } = prepareSlideNode(section, w, h, measure, theme, format);
    const { commands } = layout(node, { x: 0, y: 0, w, h: targetH }, measure);
    return { commands, height: targetH };
}

// The same slide as a structural ghost — the "generating" state at slide geometry (Spotlight strip).
export function layoutSlideSkeleton(
    section: Section,
    w: number,
    h: number,
    measure: MeasureText,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
): { commands: RenderCommand[]; height: number } {
    const { node, targetH } = prepareSlideNode(section, w, h, measure, theme, format);
    const { commands } = layout(
        skeletonize(node, ghostColorsFor(theme)),
        { x: 0, y: 0, w, h: targetH },
        measure,
    );
    return { commands, height: targetH };
}

export function layoutNode(
    node: EngineNode,
    width: number,
    measure: MeasureText,
): { commands: RenderCommand[]; height: number } {
    const { commands } = layout(node, { x: 0, y: 0, w: width, h: 100000 }, measure);
    return { commands, height: bottom(commands) };
}
