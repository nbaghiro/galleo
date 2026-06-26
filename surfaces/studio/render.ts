import type { LayoutCtx } from "@elements/element-spec";
import type { EngineNode, MeasureText } from "@engine/node";
import type { Region, RenderCommand } from "@engine/render-command";
import type { Section } from "@model/content";
import type { FormatDescriptor } from "@model/format";
import { composeSection } from "@elements/compose";
import { layout } from "@engine/layout";

// Imperative bridge: kernel layout → render commands. Components paint these into refs; the engine
// stays the single source of geometry (the framework never lays out content).

export const SECTION_GAP = 22;

const format: FormatDescriptor = {
    id: "deck",
    name: "Deck",
    kind: "paged",
    width: 1000,
    height: 625,
    tokenScale: 1,
    splitMinWidth: 520,
    paginate: "always",
};

export function ctxFor(width: number): LayoutCtx {
    return { box: { x: 0, y: 0, w: width, h: 0 }, availWidth: width, format, tokens: {}, theme: {} };
}

function bottom(commands: RenderCommand[]): number {
    return commands.reduce((m, c) => Math.max(m, c.box.y + c.box.h), 0);
}

export function layoutSection(
    section: Section,
    width: number,
    measure: MeasureText,
): { commands: RenderCommand[]; regions: Region[]; height: number } {
    const node = composeSection(section, ctxFor(width));
    const { commands, regions } = layout(node, { x: 0, y: 0, w: width, h: 100000 }, measure);
    return { commands, regions, height: bottom(commands) };
}

export function layoutNode(
    node: EngineNode,
    width: number,
    measure: MeasureText,
): { commands: RenderCommand[]; height: number } {
    const { commands } = layout(node, { x: 0, y: 0, w: width, h: 100000 }, measure);
    return { commands, height: bottom(commands) };
}
