import { expect } from "vitest";
import type {
    DrawContext,
    EngineNode,
    MeasureText,
    PathSink,
    Rect,
    Region,
    RenderCommand,
} from "@engine/node";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import type { ElementLayout, FormatDescriptor, Size } from "@model/geometry";
import type { LayoutCtx } from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";
import { layout } from "@engine/layout";
import { resolveProfile } from "@engine/profile";
import { DEFAULT_THEME } from "@themes";

// Shared helpers for the canvas suite. The ONLY substitute for a real dependency here is `measure` (glyph
// metrics) — see the mocking contract in .docs/testing.md. Everything else (builders, finders) is plumbing
// over real engine output. Excluded from coverage (see vitest.config.ts).

// Deterministic glyph metrics: 8px per char unwrapped, 16px per line, wrapping at maxWidth. Stands in for
// font measurement so the layout/wrap math is what's under test — not the font.
export const measure: MeasureText = (leaf, maxW) => {
    const unwrapped = leaf.text.length * 8;
    if (leaf.wrap === "none" || !Number.isFinite(maxW)) return { width: unwrapped, height: 16 };
    const lines = Math.max(1, Math.ceil(unwrapped / Math.max(1, maxW)));
    return { width: Math.min(unwrapped, maxW), height: lines * 16 };
};

// Assert two engine floats are within `eps` px (the solver works in floats).
export const near = (a: number, b: number, eps = 1): void =>
    expect(Math.abs(a - b), `expected ${a} ≈ ${b} (±${eps})`).toBeLessThanOrEqual(eps);

// Drive the full solver at a container of (w × h) with the deterministic measure.
export const runLayout = (
    node: EngineNode,
    w: number,
    h: number,
): { commands: RenderCommand[]; regions: Region[] } => layout(node, { x: 0, y: 0, w, h }, measure);

// --- EngineNode builders (a filled leaf, a row, a column, a text leaf) ---

export const boxNode = (id: string, w: Size, h: Size, extra?: Partial<EngineNode>): EngineNode => ({
    id,
    w,
    h,
    fill: { color: "#000" },
    ...extra,
});
export const rowNode = (children: EngineNode[], extra?: Partial<EngineNode>): EngineNode => ({
    w: fixed(200),
    h: fixed(200),
    direction: "row",
    children,
    ...extra,
});
export const colNode = (children: EngineNode[], extra?: Partial<EngineNode>): EngineNode => ({
    w: fixed(200),
    h: fixed(200),
    direction: "col",
    children,
    ...extra,
});
export const textNode = (text: string, extra?: Partial<EngineNode>): EngineNode => ({
    w: fit(),
    h: grow(),
    text: { text, fontId: "f", size: 12, wrap: "words" },
    ...extra,
});

// --- finders over layout output ---

export const regionById = (regions: Region[], id: string): Region => {
    const r = regions.find((x) => x.id === id);
    if (!r) throw new Error(`no region "${id}"`);
    return r;
};
export const boxOf = (regions: Region[], id: string): Rect => regionById(regions, id).box;
export const commandsFor = (commands: RenderCommand[], id: string): RenderCommand[] =>
    commands.filter((c) => c.id === id);
export const commandById = (commands: RenderCommand[], id: string): RenderCommand => {
    const c = commands.find((x) => x.id === id);
    if (!c) throw new Error(`no command for "${id}"`);
    return c;
};
export const bottomOf = (commands: RenderCommand[]): number =>
    commands.reduce((mx, c) => Math.max(mx, c.box.y + c.box.h), 0);

// --- content-model helpers (for registry-dependent element/ops/compose tests) ---

// The real default theme tokens — element/compose tests run against real theme values, not a fake fixture.
export const tokens = DEFAULT_THEME.tokens;

export const inst = (type: string, data: unknown = {}, lyt?: ElementLayout): ElementInstance =>
    lyt ? { type, data, layout: lyt } : { type, data };
export const sectionOf = (root: ElementInstance, extra?: Partial<Section>): Section => ({
    id: "s1",
    root,
    ...extra,
});
export const artifactOf = (sections: Section[]): ArtifactContent => ({
    format: "deck",
    theme: "default",
    sections,
});
export const layoutCtx = (
    width = 800,
    format: FormatDescriptor = resolveProfile("deck"),
    theme = tokens,
): LayoutCtx => ({ box: { x: 0, y: 0, w: width, h: 600 }, availWidth: width, format, theme });

// --- recording DrawContext (surface renderers: shape, charts, diagrams) ---

// A real DrawContext (not a mock of the logic) that records every primitive call. The renderer computes
// real geometry (incl. d3); tests assert the resulting call stream, not pixels. `measureText` returns the
// deterministic glyph width so label-aware chrome lays out without a canvas.
export interface DrawCall {
    op: string;
    [k: string]: unknown;
}
export function recordingDrawContext(): { ctx: DrawContext; calls: DrawCall[] } {
    const calls: DrawCall[] = [];
    const push = (op: string, rest: Record<string, unknown>): void => {
        calls.push({ op, ...rest });
    };
    const sink: PathSink = {
        moveTo: (x, y) => push("moveTo", { x, y }),
        lineTo: (x, y) => push("lineTo", { x, y }),
        bezierCurveTo: (cp1x, cp1y, cp2x, cp2y, x, y) =>
            push("bezierCurveTo", { cp1x, cp1y, cp2x, cp2y, x, y }),
        quadraticCurveTo: (cpx, cpy, x, y) => push("quadraticCurveTo", { cpx, cpy, x, y }),
        arc: (cx, cy, r, startRad, endRad, ccw) =>
            push("arc", { cx, cy, r, startRad, endRad, ccw }),
        arcTo: (x1, y1, x2, y2, r) => push("arcTo", { x1, y1, x2, y2, r }),
        rect: (x, y, w, h) => push("path.rect", { x, y, w, h }),
        closePath: () => push("closePath", {}),
    };
    const ctx: DrawContext = {
        rect: (x, y, w, h, style) => push("rect", { x, y, w, h, style }),
        line: (x1, y1, x2, y2, style) => push("line", { x1, y1, x2, y2, style }),
        circle: (cx, cy, r, style) => push("circle", { cx, cy, r, style }),
        polyline: (points, style) => push("polyline", { points, style }),
        wedge: (cx, cy, r, startRad, endRad, style) =>
            push("wedge", { cx, cy, r, startRad, endRad, style }),
        path: (build, style) => {
            push("path", { style });
            build(sink);
        },
        text: (text, x, y, style) => push("text", { text, x, y, style }),
        measureText: (text) => ({ width: text.length * 8 }),
    };
    return { ctx, calls };
}
