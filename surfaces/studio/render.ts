import type { LayoutCtx } from "@elements/element-spec";
import type { EngineNode, MeasureText } from "@engine/node";
import type { Region, RenderCommand } from "@engine/render-command";
import type { Section } from "@model/content";
import type { FormatDescriptor } from "@model/format";
import type { Tokens } from "@themes/theme";
import { composeSection } from "@elements/compose";
import { layout } from "@engine/layout";
import { DEFAULT_PROFILE } from "@engine/profile";
import { fixed } from "@model/size";
import { DEFAULT_THEME } from "@themes/library";

// Imperative bridge: kernel layout → render commands. Components paint these into refs; the engine
// stays the single source of geometry (the framework never lays out content).

export const SECTION_GAP = 22;

export function ctxFor(width: number, theme: Tokens = DEFAULT_THEME.tokens, format: FormatDescriptor = DEFAULT_PROFILE): LayoutCtx {
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

// A presentation slide: the section rendered full-bleed and stretched to FILL the slide (content
// centered), so a short section sizes up to the whole frame. A section taller than the slide keeps
// its natural height (the caller scales it down to fit).
export function layoutSlide(
    section: Section,
    w: number,
    h: number,
    measure: MeasureText,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
): { commands: RenderCommand[]; height: number } {
    const node = composeSection(section, ctxFor(w, theme, format));
    if (node.fill) node.fill = { ...node.fill, radius: 0, border: undefined }; // full-bleed slide
    if (node.image) node.image = { ...node.image, radius: 0 };

    const natural = bottom(layout(node, { x: 0, y: 0, w, h: 100000 }, measure).commands);
    const targetH = Math.max(h, natural);
    node.h = fixed(targetH);
    node.alignY = "center";
    const { commands } = layout(node, { x: 0, y: 0, w, h: targetH }, measure);
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
