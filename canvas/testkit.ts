import { expect } from "vitest";
import type { EngineNode, MeasureText, Rect, Region, RenderCommand } from "@engine/node";
import type { Size } from "@model/geometry";
import { fit, fixed, grow } from "@model/geometry";
import { layout } from "@engine/layout";

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
