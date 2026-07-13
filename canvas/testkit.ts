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

// canvas-suite test helpers; `measure` is the only mocked dep (see .docs/testing.md)

// deterministic glyph metrics: 8px/char, 16px/line, wraps at maxWidth
export const measure: MeasureText = (leaf, maxW) => {
    const unwrapped = leaf.text.length * 8;
    if (leaf.wrap === "none" || !Number.isFinite(maxW)) return { width: unwrapped, height: 16 };
    const lines = Math.max(1, Math.ceil(unwrapped / Math.max(1, maxW)));
    return { width: Math.min(unwrapped, maxW), height: lines * 16 };
};

// within eps px (solver works in floats)
export const near = (a: number, b: number, eps = 1): void =>
    expect(Math.abs(a - b), `expected ${a} ≈ ${b} (±${eps})`).toBeLessThanOrEqual(eps);

export const runLayout = (
    node: EngineNode,
    w: number,
    h: number,
): { commands: RenderCommand[]; regions: Region[] } => layout(node, { x: 0, y: 0, w, h }, measure);

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

// real default theme tokens (not a fake fixture)
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

// real DrawContext that records every primitive call; tests assert the call stream, not pixels
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

// minimal Canvas 2D (no-op font, deterministic measureText) to drive layoutRuns for real
export function textMetricsCtx(): CanvasRenderingContext2D {
    return {
        set font(_v: string) {},
        measureText: (t: string) => ({ width: t.length * 8 }),
    } as unknown as CanvasRenderingContext2D;
}

// patch HTMLCanvasElement.getContext("2d") (happy-dom); call once in a beforeAll before any measurement
export function installCanvas2D(): void {
    const HC = (globalThis as Record<string, unknown>).HTMLCanvasElement as
        | { prototype: Record<string, unknown> }
        | undefined;
    if (!HC) return;
    const noop = (): void => {};
    const fake = new Proxy(
        {
            measureText: (t: string) => ({ width: t.length * 8 }),
            createLinearGradient: () => ({ addColorStop: noop }),
        } as Record<string, unknown>,
        { get: (t, p) => (p in t ? t[p as string] : noop), set: () => true },
    );
    HC.prototype.getContext = () => fake;
}
