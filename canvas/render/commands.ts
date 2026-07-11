// Layout + text metrics: turn a Section's content into positioned render commands, and measure text (the base paint-layer input).

import type { LayoutCtx } from "@elements/spec";
import type {
    EngineNode,
    MeasureText,
    Region,
    RenderCommand,
    Measured,
    Run,
    TextLeaf,
} from "@engine/node";
import type { Section } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { composeSection } from "@elements/compose";
import { skeletonize } from "@elements/spec";
import { layout } from "@engine/layout";
import { DEFAULT_PROFILE } from "@engine/profile";
import { fixed, grow } from "@model/geometry";
import { DEFAULT_THEME, mix } from "@themes";

// Imperative bridge: engine layout → render commands. Components paint these into refs; the engine
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

// The first aspect-ratio media leaf within a subtree — an image OR a video (any node whose height derives
// from a fixed width:height ratio). These are what make a section taller than a fixed slide.
function findAspectMedia(n: EngineNode): EngineNode | null {
    if (n.aspect !== undefined) return n;
    for (const c of n.children ?? []) {
        const found = findAspectMedia(c);
        if (found) return found;
    }
    return null;
}

// A deck slide only has to fit 16:9. Aspect media (a portrait image, a 16:9 video) sized by its ratio can
// make its section taller than the slide, forcing the whole thing to scale down and letterbox. When a
// section overflows and has at least one NON-media flow sibling to set the height, convert the media to
// fill-and-crop (grow height, drop the ratio, cover images) so it absorbs the slack instead of dictating a
// tall fixed height. Works for media BESIDE text (a row column) and media UNDER text (a column). Returns the
// flow containers changed + the media nodes flexed (the caller grows the containers + probes the fit).
function coverFitMedia(root: EngineNode): { containers: EngineNode[]; media: EngineNode[] } {
    // A "cell" is an addressable element node (composeElement tags each with an `el:…` id). A row/col whose
    // children carry those ids is a real content flow (a section's split, or a nested group) — not a leaf
    // element's internal layout, whose parts have no id.
    const flows: EngineNode[] = [];
    const collect = (n: EngineNode): void => {
        if (
            (n.direction === "row" || n.direction === "col") &&
            (n.children ?? []).some((c) => c.id?.startsWith("el:"))
        )
            flows.push(n);
        n.children?.forEach(collect);
    };
    collect(root);
    const containers: EngineNode[] = [];
    const media: EngineNode[] = [];
    for (const flow of flows) {
        const cells = (flow.children ?? []).filter((c) => c.id?.startsWith("el:"));
        const mediaCells = cells.filter((c) => findAspectMedia(c));
        // Need a non-media cell to set the height and a media cell to flex; skip all-media / all-text flows.
        if (cells.length < 2 || mediaCells.length === 0 || mediaCells.length === cells.length)
            continue;
        for (const cell of mediaCells) {
            const m = findAspectMedia(cell)!;
            cell.h = grow();
            m.h = grow();
            m.aspect = undefined;
            if (m.image) m.image = { ...m.image, fit: "cover" };
            media.push(m);
        }
        containers.push(flow);
    }
    return { containers, media };
}

// Prepare a full-bleed slide node: drop corner radii/borders and stretch it to FILL the slide (content
// centered). A short section sizes up to the whole frame. A taller text+media section cover-fits its media
// (beside OR under the text) so it fills the frame instead of scaling down; anything still too tall (long
// text) keeps its natural height and the caller scales it down. Returns the node + resolved height.
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
    let natural = bottom(layout(node, { x: 0, y: 0, w, h: 100000 }, measure).commands);
    if (natural > h) {
        const { containers, media } = coverFitMedia(node);
        if (containers.length) {
            // Probe: collapse the now-flexible media to nothing and measure the rest. If the non-media
            // content fits the slide, the media can absorb the overflow (cross-axis fill beside the text,
            // main-axis fill under it), so grow the containers and pin the section to the frame.
            for (const m of media) m.h = fixed(0);
            const minH = bottom(layout(node, { x: 0, y: 0, w, h: 100000 }, measure).commands);
            for (const m of media) m.h = grow();
            if (minH <= h) {
                for (const c of containers) c.h = grow();
                node.h = fixed(h);
                node.alignY = "center";
                return { node, targetH: h };
            }
            natural = Math.min(natural, minH); // still overflowing (long text) → less to scale down
        }
    }
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

// Canvas-based text measurement injected into the engine (keeps the engine DOM-free).

// Shared inline-code treatment (kept identical across measure + both backends so widths agree).
export const MONO_FONT_STACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const CODE_BG = "rgba(120, 120, 120, 0.12)";

let ctx2d: CanvasRenderingContext2D | undefined;

function getCtx(): CanvasRenderingContext2D {
    if (!ctx2d) {
        const canvas = document.createElement("canvas");
        const cx = canvas.getContext("2d");
        if (!cx) throw new Error("no 2d canvas context available");
        ctx2d = cx;
    }
    return ctx2d;
}

// The CSS `font` shorthand for one run: inherits the leaf's base size, overrides weight/style/family.
export function runFont(leaf: TextLeaf, run: Run): string {
    const weight = run.bold ? 700 : (leaf.weight ?? 400);
    const style = run.italic ? "italic " : "";
    const family = run.code ? MONO_FONT_STACK : leaf.fontId;
    return `${style}${weight} ${leaf.size}px ${family}`;
}

// --- run-aware wrap (shared by measure + the canvas backend so line breaks + geometry match) ---

// A painted piece of a wrapped line: the styled text plus its x offset and width within the line.
export interface RunFrag {
    text: string;
    font: string;
    color?: string;
    underline: boolean;
    strike: boolean;
    code: boolean;
    highlight?: string;
    x: number;
    width: number;
}

export interface RunLine {
    frags: RunFrag[];
    width: number;
}

export interface RunLayout {
    lines: RunLine[];
    width: number; // widest line (clamped to maxWidth when wrapping)
    height: number;
    lineHeight: number;
}

interface Piece {
    text: string;
    font: string;
    run: Run;
}

type Token = { kind: "box" | "glue" | "break"; pieces: Piece[] };

// Break a leaf's runs into layout tokens: boxes (words, which may span run boundaries), glues (a
// single collapsed space), and hard breaks (\n) — mirroring measure's greedy word-wrap.
function tokenize(leaf: TextLeaf): Token[] {
    const tokens: Token[] = [];
    let word: Piece[] = [];
    const flushWord = (): void => {
        if (word.length) {
            tokens.push({ kind: "box", pieces: word });
            word = [];
        }
    };
    const pushGlue = (piece: Piece): void => {
        flushWord();
        const prev = tokens[tokens.length - 1];
        if (prev && prev.kind === "glue") return; // collapse consecutive whitespace to one space
        tokens.push({ kind: "glue", pieces: [piece] });
    };

    for (const run of leaf.runs ?? []) {
        const font = runFont(leaf, run);
        const parts = run.text.match(/\n|[^\S\n]+|[^\s]+/g) ?? [];
        for (const part of parts) {
            if (part === "\n") {
                flushWord();
                tokens.push({ kind: "break", pieces: [] });
            } else if (/\S/.test(part)) {
                word.push({ text: part, font, run });
            } else {
                pushGlue({ text: " ", font, run });
            }
        }
    }
    flushWord();
    return tokens;
}

function toFrag(cx: CanvasRenderingContext2D, piece: Piece, x: number): RunFrag {
    cx.font = piece.font;
    const width = cx.measureText(piece.text).width;
    const r = piece.run;
    return {
        text: piece.text,
        font: piece.font,
        color: r.color,
        underline: !!r.underline,
        strike: !!r.strike,
        code: !!r.code,
        highlight: r.highlight,
        x,
        width,
    };
}

// Greedy word-wrap a runs-carrying leaf into positioned lines (x offsets are line-local, pre-align).
export function layoutRuns(
    cx: CanvasRenderingContext2D,
    leaf: TextLeaf,
    maxWidth: number,
): RunLayout {
    const lineHeight = leaf.lineHeight ?? leaf.size * 1.35;
    const noWrap = leaf.wrap === "none" || !Number.isFinite(maxWidth);
    const tokens = tokenize(leaf);

    const lines: RunLine[] = [];
    let frags: RunFrag[] = [];
    let width = 0;
    let pendingGlue: Piece | undefined;

    const endLine = (): void => {
        lines.push({ frags, width });
        frags = [];
        width = 0;
        pendingGlue = undefined;
    };
    const place = (piece: Piece): void => {
        const frag = toFrag(cx, piece, width);
        frags.push(frag);
        width += frag.width;
    };

    for (const tok of tokens) {
        if (tok.kind === "break") {
            endLine();
            continue;
        }
        if (tok.kind === "glue") {
            pendingGlue = tok.pieces[0];
            continue;
        }
        // A word: measure its pieces (word may cross run/font boundaries) as one indivisible box.
        let boxW = 0;
        for (const p of tok.pieces) {
            cx.font = p.font;
            boxW += cx.measureText(p.text).width;
        }
        const hasLead = frags.length > 0;
        let glueW = 0;
        if (pendingGlue && hasLead) {
            cx.font = pendingGlue.font;
            glueW = cx.measureText(pendingGlue.text).width;
        }
        if (!noWrap && hasLead && width + glueW + boxW > maxWidth) {
            endLine(); // wrap: the leading space is dropped at the new line's start
            for (const p of tok.pieces) place(p);
        } else {
            if (pendingGlue && hasLead) place(pendingGlue);
            pendingGlue = undefined;
            for (const p of tok.pieces) place(p);
        }
    }
    endLine();

    const rawWidth = Math.max(0, ...lines.map((l) => l.width));
    return {
        lines,
        width: noWrap ? rawWidth : Math.min(rawWidth, maxWidth),
        height: lines.length * lineHeight,
        lineHeight,
    };
}

const measureUncached = (leaf: TextLeaf, maxWidth: number): Measured => {
    const cx = getCtx();
    const lineHeight = leaf.lineHeight ?? leaf.size * 1.35;

    // Run-aware path: measure across style boundaries (bold/italic/code change advance width).
    if (leaf.runs && leaf.runs.length > 0) {
        const laid = layoutRuns(cx, leaf, maxWidth);
        return { width: laid.width, height: laid.height };
    }

    // Plain-text path — unchanged, so text without runs measures exactly as before.
    cx.font = `${leaf.weight ?? 400} ${leaf.size}px ${leaf.fontId}`;
    const hard = leaf.text.split("\n"); // explicit (shift-enter) line breaks

    if (leaf.wrap === "none" || !Number.isFinite(maxWidth)) {
        const width = Math.max(0, ...hard.map((l) => cx.measureText(l).width));
        return { width, height: hard.length * lineHeight };
    }

    let lines = 0;
    let widest = 0;
    for (const seg of hard) {
        const words = seg.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            lines += 1; // an empty hard line still occupies a row
            continue;
        }
        let line = "";
        let segLines = 1;
        for (const word of words) {
            const candidate = line === "" ? word : `${line} ${word}`;
            if (cx.measureText(candidate).width > maxWidth && line !== "") {
                widest = Math.max(widest, cx.measureText(line).width);
                line = word;
                segLines += 1;
            } else {
                line = candidate;
            }
        }
        widest = Math.max(widest, cx.measureText(line).width);
        lines += segLines;
    }
    return { width: Math.min(widest, maxWidth), height: lines * lineHeight };
};

// Memoized text measurement: measureUncached runs a Canvas measureText per word and is called for every
// leaf on every layout, and the same (text, font, size, width) recurs constantly across redraws. Key on
// the metric-affecting inputs only (bold/italic/code change a run's advance; a width-independent measure
// collapses its maxWidth). Cleared on font load, below.
const measureCache = new Map<string, Measured>();
const MEASURE_CACHE_CAP = 6000;

function measureKey(leaf: TextLeaf, maxWidth: number): string {
    const mw = leaf.wrap === "none" || !Number.isFinite(maxWidth) ? "*" : maxWidth;
    const base = `${leaf.size};${leaf.weight ?? 400};${leaf.lineHeight ?? 0};${leaf.wrap};${mw};${leaf.fontId}`;
    if (leaf.runs && leaf.runs.length > 0) {
        let r = "";
        for (const run of leaf.runs)
            r += `${run.bold ? 1 : 0}${run.italic ? 1 : 0}${run.code ? 1 : 0}${run.text}`;
        return `${base} R${r}`;
    }
    return `${base} ${leaf.text}`;
}

export function clearMeasureCache(): void {
    measureCache.clear();
}

export const measureText = (leaf: TextLeaf, maxWidth: number): Measured => {
    const key = measureKey(leaf, maxWidth);
    const hit = measureCache.get(key);
    if (hit) return hit;
    const result = measureUncached(leaf, maxWidth);
    if (measureCache.size >= MEASURE_CACHE_CAP) {
        // FIFO-evict the oldest quarter (Map preserves insertion order) — cheap and occasional.
        let n = MEASURE_CACHE_CAP >> 2;
        for (const k of measureCache.keys()) {
            measureCache.delete(k);
            if (--n <= 0) break;
        }
    }
    measureCache.set(key, result);
    return result;
};

// Fonts load after first paint; until then leaves measure with a fallback face. Drop the cache on font
// load so the next layout re-measures with real metrics (all consumers share this one cache).
if (typeof document !== "undefined" && document.fonts) {
    document.fonts.addEventListener("loadingdone", clearMeasureCache);
}
