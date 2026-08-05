import type { EngineNode, RenderCommand } from "@engine/node";
import type { Section, SectionSummary } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { fixed, grow, percent } from "@model/geometry";
import { fontStack, mix } from "@themes";
import { layout } from "@engine/layout";
import { measureText } from "./commands";
import { estimateSectionHeight } from "./window";

// What a section looks like before its content arrives. The digest already knows its kind and title,
// so the stand-in can be the right shape with the real heading in it, which makes scrolling through an
// unloaded stretch navigable instead of a run of blank boxes. Sized to the height the stack reserves,
// so the body fills it rather than floating in dead space.

const TITLE = 26;
const GAP = 14;
const PAD = 28;
const LINE = 11;
const LINE_GAP = 15;

interface Ghost {
    bar: string;
    panel: string;
    ink: string;
}

const ghostOf = (theme: Tokens): Ghost => ({
    bar: mix(theme.surface, theme.ink, 0.16),
    panel: mix(theme.surface, theme.ink, 0.08),
    ink: mix(theme.bg, theme.ink, 0.42),
});

const bar = (g: Ghost, widthFrac: number, h = LINE): EngineNode => ({
    w: percent(widthFrac),
    h: fixed(h),
    fill: { color: g.bar, radius: Math.min(5, h / 2) },
});

const box = (color: string, h: number, radius = 10): EngineNode => ({
    w: grow(),
    h: fixed(Math.max(0, h)),
    fill: { color, radius },
});

const heading = (g: Ghost, theme: Tokens, title: string): EngineNode => ({
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

// widths cycle so a run of lines reads like prose rather than a bar chart
const WIDTHS = [1, 0.96, 0.99, 0.93, 1, 0.9];
function paragraph(g: Ghost, h: number, max = 20): EngineNode[] {
    const n = Math.max(2, Math.min(max, Math.floor(h / (LINE + LINE_GAP))));
    return Array.from({ length: n }, (_, i) =>
        bar(g, i === n - 1 ? 0.45 : (WIDTHS[i % WIDTHS.length] ?? 1)),
    );
}

function body(summary: SectionSummary, g: Ghost, h: number): EngineNode[] {
    switch (summary.kind) {
        case "chart":
            return [
                {
                    w: grow(),
                    h: fixed(h),
                    direction: "row",
                    gap: 12,
                    alignY: "end",
                    padding: { top: 16, bottom: 16, left: 16, right: 16 },
                    fill: { color: g.panel, radius: 12 },
                    children: [0.45, 0.75, 0.3, 1, 0.6].map((f) => box(g.bar, (h - 32) * f, 4)),
                },
            ];
        case "diagram":
            return [
                {
                    w: grow(),
                    h: fixed(h),
                    direction: "row",
                    gap: 14,
                    alignY: "center",
                    padding: { top: 16, bottom: 16, left: 16, right: 16 },
                    fill: { color: g.panel, radius: 12 },
                    children: [0.7, 0.45, 0.7].map((f) => box(g.bar, (h - 32) * f, 8)),
                },
            ];
        case "table":
            return [box(g.bar, 24, 4), ...paragraph(g, h - 24 - GAP)];
        case "media":
            return [box(g.panel, h, 12)];
        case "stat":
            return [
                {
                    w: grow(),
                    h: fixed(Math.min(h, 160)),
                    direction: "row",
                    gap: 18,
                    children: [0, 1, 2].map(() => box(g.panel, Math.min(h, 160), 12)),
                },
            ];
        case "quote":
            return [bar(g, 0.92, 18), bar(g, 0.78, 18), bar(g, 0.35, 18)];
        default:
            return paragraph(g, h);
    }
}

function ghostNode(summary: SectionSummary, theme: Tokens, height: number): EngineNode {
    const g = ghostOf(theme);
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
            summary.title ? heading(g, theme, summary.title) : bar(g, 0.5, 20),
            ...(cover ? [bar(g, 0.62, 13)] : body(summary, g, bodyH)),
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
