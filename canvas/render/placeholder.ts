import type { EngineNode, RenderCommand } from "@engine/node";
import type { Section, SectionSummary } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import type { GhostColors } from "@elements/ghost";
import { fixed, grow } from "@model/geometry";
import { fontStack } from "@themes";
import { ghostBar, ghostBody, ghostColors } from "@elements/ghost";
import { layout } from "@engine/layout";
import { measureText } from "./commands";
import { estimateSectionHeight } from "./window";

// What a section looks like before its content arrives. The digest already knows its kind and title,
// so the stand-in can be the right shape with the real heading in it, which makes scrolling through an
// unloaded stretch navigable instead of a run of blank boxes. Sized to the height the stack reserves,
// so the body fills it rather than floating in dead space. Shapes and colors are the shared ghost
// vocabulary (@elements/ghost); only the real heading is drawn here, since the placeholder knows it.

const TITLE = 26;
const GAP = 14;
const PAD = 28;

const heading = (g: GhostColors, theme: Tokens, title: string): EngineNode => ({
    w: grow(),
    h: fixed(Math.round(TITLE * 1.3)),
    text: {
        text: title,
        fontId: fontStack("display", theme),
        size: TITLE,
        weight: theme.headingWeight,
        color: g.ink,
        align: "start",
        wrap: "none",
    },
});

function ghostNode(summary: SectionSummary, theme: Tokens, height: number): EngineNode {
    const g = ghostColors(theme);
    const cover = summary.kind === "cover";
    const titleH = Math.round(TITLE * 1.3);
    const bodyH = Math.max(40, height - PAD * 2 - titleH - GAP);
    return {
        w: grow(),
        h: fixed(height),
        direction: "col",
        gap: GAP,
        alignY: cover ? "center" : "start",
        padding: { top: PAD, bottom: PAD, left: 0, right: 0 },
        children: [
            summary.title ? heading(g, theme, summary.title) : ghostBar(g, 0.5, 20),
            ...(cover ? [ghostBar(g, 0.62, 13)] : ghostBody(summary.kind, g, bodyH)),
        ],
    };
}

/**
 * The stand-in a not-yet-loaded section paints, at the height the stack already reserves for it, so
 * resolving the real content moves nothing above it.
 */
export function layoutPlaceholder(
    section: Section,
    summary: SectionSummary,
    width: number,
    theme: Tokens,
    profile: FormatDescriptor,
    fullW: number,
    known?: number,
): { commands: RenderCommand[]; height: number } {
    const height = known ?? estimateSectionHeight(section, profile, fullW, summary.size);
    const { commands } = layout(
        ghostNode(summary, theme, height),
        { x: 0, y: 0, w: width, h: height },
        measureText,
    );
    return { commands, height };
}
