import type { LayoutCtx } from "@elements/spec";
import type {
    EngineNode,
    MeasureText,
    Region,
    RenderCommand,
    Measured,
    Run,
    TextFrag,
    TextLeaf,
    TextLine,
} from "@engine/node";
import type { Section } from "@model/artifact";
import { sectionRegionId } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { composeSection } from "@elements/compose";
import { skeletonize } from "@elements/spec";
import { fragment, layout } from "@engine/layout";
import { DEFAULT_PROFILE, FIT_FLOOR, MIN_TEXT_PX, sectionFrame } from "@engine/profile";
import { fixed, grow } from "@model/geometry";
import { DEFAULT_THEME, mix } from "@themes";

export const SECTION_GAP = 22;

// `measure` defaults to the canvas-2D measurer; callers that inject one into layout() must pass
// the same one here, so compose-time sizing (a diagram's node widths) can never disagree with the
// layout pass
export function ctxFor(
    width: number,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
    plain = false,
    measure: MeasureText = measureText,
): LayoutCtx {
    return {
        box: { x: 0, y: 0, w: width, h: 0 },
        availWidth: width,
        format,
        theme,
        measure,
        plain,
    };
}

// a rotated command's painted extent is its turned corners, not its flat box
function lowest(c: RenderCommand): number {
    const b = c.box;
    if (!c.rotate) return b.y + b.h;
    const rad = (c.rotate.deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ys = (
        [
            [b.x, b.y],
            [b.x + b.w, b.y],
            [b.x + b.w, b.y + b.h],
            [b.x, b.y + b.h],
        ] as const
    ).map(([px, py]) => c.rotate!.cy + (px - c.rotate!.cx) * sin + (py - c.rotate!.cy) * cos);
    return Math.max(...ys);
}

function bottom(commands: RenderCommand[]): number {
    return commands.reduce((m, c) => Math.max(m, lowest(c)), 0);
}

export function layoutSection(
    section: Section,
    width: number,
    measure: MeasureText,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
    plain = false,
): { commands: RenderCommand[]; regions: Region[]; height: number } {
    const node = composeSection(section, ctxFor(width, theme, format, plain, measure));
    const { commands, regions } = layout(node, { x: 0, y: 0, w: width, h: 100000 }, measure);
    const height = bottom(commands);
    // A pinned descendant can outrun the flow, and the flow is all a fit height counts. The stack
    // already advances by the measured extent; the section's own ground (and its region) stretch to
    // it too, so the overhang stays inside its band instead of hanging over the next section's.
    const sid = sectionRegionId(section.id);
    for (const c of commands)
        if (c.id === sid && (c.kind === "rect" || c.kind === "image"))
            c.box = { ...c.box, h: Math.max(c.box.h, height - c.box.y) };
    for (const r of regions)
        if (r.id === sid) r.box = { ...r.box, h: Math.max(r.box.h, height - r.box.y) };
    return { commands, regions, height };
}

function ghostColorsFor(theme: Tokens): { bar: string; panel: string; line: string } {
    return { bar: mix(theme.surface, theme.ink, 0.2), panel: theme.surface, line: theme.line };
}

// skeletonize the real composed node so the ghost occupies the exact final geometry (can't drift)
export function layoutSectionSkeleton(
    section: Section,
    width: number,
    measure: MeasureText,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
): { commands: RenderCommand[]; height: number } {
    const node = skeletonize(
        composeSection(section, ctxFor(width, theme, format, false, measure)),
        ghostColorsFor(theme),
    );
    const { commands } = layout(node, { x: 0, y: 0, w: width, h: 100000 }, measure);
    return { commands, height: bottom(commands) };
}

// first aspect-ratio media: what makes a section taller than its frame
function findAspectMedia(n: EngineNode): EngineNode | null {
    if (n.aspect !== undefined) return n;
    for (const c of n.children ?? []) {
        const found = findAspectMedia(c);
        if (found) return found;
    }
    return null;
}

interface CoverFit {
    containers: EngineNode[];
    media: EngineNode[];
    chain: EngineNode[];
}

// fill-and-crop the dominant media so it absorbs slide slack instead of forcing a scale-down
function coverFitMedia(root: EngineNode): CoverFit {
    // el:… ids mark real content-flow cells (composeElement tags them), not a leaf's internal layout
    const flows: EngineNode[] = [];
    const parent = new Map<EngineNode, EngineNode>();
    const collect = (n: EngineNode): void => {
        if (
            (n.direction === "row" || n.direction === "col") &&
            (n.children ?? []).some((c) => c.id?.startsWith("el:"))
        )
            flows.push(n);
        for (const c of n.children ?? []) {
            parent.set(c, n);
            collect(c);
        }
    };
    collect(root);
    const containers: EngineNode[] = [];
    const media: EngineNode[] = [];
    const chain = new Set<EngineNode>();
    for (const flow of flows) {
        const cells = (flow.children ?? []).filter((c) => c.id?.startsWith("el:"));
        const mediaCells = cells.filter((c) => findAspectMedia(c));
        // only cover-fit a single dominant media; multi-media sections are better paginated (left tall here)
        if (cells.length < 2 || mediaCells.length !== 1) continue;
        for (const cell of mediaCells) {
            const m = findAspectMedia(cell)!;
            cell.h = grow();
            m.h = grow();
            m.aspect = undefined;
            if (m.image) m.image = { ...m.image, fit: "cover" };
            media.push(m);
        }
        containers.push(flow);
        // Every wrapper between the slide frame and this container must pass the height down: a `fit`
        // ancestor (composeSection's gutter box) hands a grow child its minimum, collapsing the media
        // to nothing. Promoting the whole path is what makes the frame's height reach the image.
        for (let a = parent.get(flow); a && a !== root; a = parent.get(a))
            if (a.h.mode === "fit") chain.add(a);
    }
    return { containers, media, chain: [...chain] };
}

const naturalHeight = (node: EngineNode, w: number, measure: MeasureText): number =>
    bottom(layout(node, { x: 0, y: 0, w, h: 100000 }, measure).commands);

// the full-bleed slide form of a section, composed at autofit scale `f`
function composeSlideNode(
    section: Section,
    w: number,
    f: number,
    measure: MeasureText,
    theme: Tokens,
    format: FormatDescriptor,
    plain: boolean,
): EngineNode {
    const node = composeSection(section, {
        ...ctxFor(w, theme, format, plain, measure),
        fitScale: f,
    });
    if (node.fill) node.fill = { ...node.fill, radius: 0, border: undefined };
    if (node.image) node.image = { ...node.image, radius: 0 };
    return node;
}

// what the section measures with its media absorbed away: coverFitMedia's precondition
function collapsedHeight(
    node: EngineNode,
    media: EngineNode[],
    w: number,
    measure: MeasureText,
): number {
    for (const m of media) m.h = fixed(0);
    const min = naturalHeight(node, w, measure);
    for (const m of media) m.h = grow();
    return min;
}

function centreInFrame(node: EngineNode, h: number): EngineNode {
    node.h = fixed(h);
    node.alignY = "center";
    return node;
}

// Threshold of the "paginate" policy: taller than this × its frame splits; below, it scales onto one
// page. An "fit" format never splits, however tall — the caller scales it instead.
const PAGINATE_ABOVE = 1.2;

/** The scale grid: a few pixels of edit must not visibly resize the type. */
export const FIT_STEP = 0.02;
const FIT_PROBES = 4; // layouts the search may spend, counting the f = 1 the caller already did
const FIT_TOL = 0.02; // a probe filling ≥98% of the frame is as close as a wrap step will get

const snapFit = (f: number, floor: number): number =>
    Math.max(floor, Math.floor(f / FIT_STEP) * FIT_STEP);

// How far the type may shrink: the flat floor, raised so the section's SMALLEST text still clears
// MIN_TEXT_PX. Sizes here are composed (past the width ramp), which is why the bound is in pixels.
function fitFloor(node: EngineNode): number {
    let smallest = Infinity;
    const walk = (n: EngineNode): void => {
        if (n.text && n.text.text.trim()) smallest = Math.min(smallest, n.text.size);
        for (const c of n.children ?? []) walk(c);
    };
    walk(node);
    if (!Number.isFinite(smallest)) return FIT_FLOOR;
    return Math.min(1, Math.max(FIT_FLOOR, MIN_TEXT_PX / smallest));
}

/**
 * The largest compose scale whose content clears `frameH`, or 1 when none does.
 *
 * Composing at `f` rather than scaling painted pixels keeps the section at its full width, so text
 * re-wraps into fewer longer lines: `H(f) ≈ A·f² + B·f + C`, monotone, which is what a seeded
 * bisection needs, and the `f²` term is why a small step buys a large height. `probe` answers with
 * the height the objective cares about (the natural height, or the media-collapsed minimum when a
 * cover-fit is waiting on the text). Probes are snapped down onto the FIT_STEP grid, so the answer
 * is already on it, and only a fitting probe is ever returned: a wrap step that breaks monotonicity
 * locally degrades to a conservative answer rather than a wrong one.
 */
export function solveFitScale(
    frameH: number,
    natural: number,
    floor: number,
    probe: (f: number) => number,
): { f: number; probes: number } {
    let good = 0; // largest scale seen to fit
    let bad = 1; // smallest seen to overflow — f = 1 by the caller's own measurement
    let probes = 1;
    let next = snapFit(Math.sqrt(frameH / natural), floor); // seeded from the f² term
    while (probes < FIT_PROBES && next > good && next < bad) {
        probes++;
        const h = probe(next);
        if (h > frameH) bad = next;
        else {
            good = next;
            if (h >= frameH * (1 - FIT_TOL)) break;
        }
        if (good && bad - good <= FIT_STEP) break;
        next = snapFit((Math.max(good, floor) + bad) / 2, floor);
    }
    return { f: good || 1, probes };
}

// Full-bleed slide node. In order: the content fits; the dominant media absorbs the slack; autofit
// re-composes the section smaller until it fits; else the caller scales the natural height down.
function prepareSlideNode(
    section: Section,
    w: number,
    h: number,
    measure: MeasureText,
    theme: Tokens,
    format: FormatDescriptor,
    plain = false,
    // hold the scale steady instead of solving (an open inline edit — see backends.paintSectionStack)
    freeze?: number,
): { node: EngineNode; targetH: number; fitScale: number } {
    const fitScale = freeze ?? 1;
    const node = composeSlideNode(section, w, fitScale, measure, theme, format, plain);
    let natural = naturalHeight(node, w, measure);
    // Splitting a section AND shrinking its type is the worst of both, so a section headed for
    // pagination composes at full size. An "fit" format never splits, so it always gets the search.
    const paginates = (hh: number): boolean => format.overflow !== "fit" && hh > h * PAGINATE_ABOVE;
    const compose = (f: number): EngineNode =>
        composeSlideNode(section, w, f, measure, theme, format, plain);

    if (natural > h) {
        const cover = coverFitMedia(node);
        if (cover.containers.length) {
            // probe with media collapsed: if the rest fits, media can absorb the overflow
            const minH = collapsedHeight(node, cover.media, w, measure);
            if (minH <= h) {
                for (const c of cover.containers) c.h = grow();
                for (const a of cover.chain) a.h = grow();
                return { node: centreInFrame(node, h), targetH: h, fitScale };
            }
            // The media can only absorb the slack once the text leaves it room, so the objective
            // here is that collapsed minimum and the media takes whatever is left over.
            if (freeze === undefined && !paginates(Math.min(natural, minH))) {
                // a closure assigning to a plain `let` defeats narrowing at the read site
                const best: { at: { node: EngineNode; cover: CoverFit } | null } = { at: null };
                const solved = solveFitScale(h, minH, fitFloor(node), (f) => {
                    const probe = compose(f);
                    const c = coverFitMedia(probe);
                    if (!c.containers.length) return Infinity;
                    const m = collapsedHeight(probe, c.media, w, measure);
                    if (m <= h) best.at = { node: probe, cover: c };
                    return m;
                });
                if (best.at) {
                    for (const c of best.at.cover.containers) c.h = grow();
                    for (const a of best.at.cover.chain) a.h = grow();
                    return {
                        node: centreInFrame(best.at.node, h),
                        targetH: h,
                        fitScale: solved.f,
                    };
                }
            }
            natural = Math.min(natural, minH); // still overflowing (long text) → less to scale down
        } else if (freeze === undefined && !paginates(natural)) {
            const best: { at: { node: EngineNode; height: number } | null } = { at: null };
            const solved = solveFitScale(h, natural, fitFloor(node), (f) => {
                const probe = compose(f);
                const height = naturalHeight(probe, w, measure);
                if (height <= h) best.at = { node: probe, height };
                return height;
            });
            if (best.at)
                return { node: centreInFrame(best.at.node, h), targetH: h, fitScale: solved.f };
        }
    }
    const targetH = Math.max(h, natural);
    return { node: centreInFrame(node, targetH), targetH, fitScale };
}

export function layoutSlide(
    section: Section,
    w: number,
    h: number,
    measure: MeasureText,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
    plain = false,
    freeze?: number,
): { commands: RenderCommand[]; regions: Region[]; height: number; fitScale: number } {
    const { node, targetH, fitScale } = prepareSlideNode(
        section,
        w,
        h,
        measure,
        theme,
        format,
        plain,
        freeze,
    );
    const { commands, regions } = layout(node, { x: 0, y: 0, w, h: targetH }, measure);
    return { commands, regions, height: targetH, fitScale };
}

export interface SlidePage {
    commands: RenderCommand[];
    w: number;
    h: number;
    contentH: number; // height the commands span; caller scales it to fit h (== h for a paginated page)
    fitScale: number; // < 1 ⇒ autofit re-composed the section to reach the frame
}

// one scaled slide, or several paginated when too tall; Present, export, and 16:9 thumbnails render
// from this, so all three agree on where a tall section breaks
export function sectionSlides(
    section: Section,
    theme: Tokens = DEFAULT_THEME.tokens,
    format: FormatDescriptor = DEFAULT_PROFILE,
    plain = false,
): SlidePage[] {
    const { w, h } = sectionFrame(section, format);
    const { node, targetH, fitScale } = prepareSlideNode(
        section,
        w,
        h,
        measureText,
        theme,
        format,
        plain,
    );
    const { commands } = layout(node, { x: 0, y: 0, w, h: targetH }, measureText);
    if (format.overflow === "fit" || targetH <= h * PAGINATE_ABOVE)
        return [{ commands, w, h, contentH: targetH, fitScale }];
    return fragment(commands, targetH, h).map((cmds) => ({
        commands: cmds,
        w,
        h,
        contentH: h,
        fitScale,
    }));
}

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
): { commands: RenderCommand[]; regions: Region[]; height: number } {
    const { commands, regions } = layout(node, { x: 0, y: 0, w: width, h: 100000 }, measure);
    return { commands, regions, height: bottom(commands) };
}

// must stay identical across measure + both backends so widths agree
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

/** The shared measuring context, for chrome that must lay runs out exactly as the paint did. */
export const measureContext = (): CanvasRenderingContext2D => getCtx();

export function runFont(leaf: TextLeaf, run: Run): string {
    const weight = run.bold ? 700 : (leaf.weight ?? 400);
    const style = run.italic ? "italic " : "";
    const family = run.code ? MONO_FONT_STACK : leaf.fontId;
    return `${style}${weight} ${leaf.size}px ${family}`;
}

// run-aware wrap: shared by measure + every backend so breaks + geometry match
export interface RunLayout {
    lines: TextLine[];
    width: number; // widest line (clamped to maxWidth when wrapping)
    height: number;
    lineHeight: number;
}

export const LINE_HEIGHT_FACTOR = 1.35;

// Per-font-string metrics, from the font bounding box so they never jitter with content; the "Hg"
// probe is only a carrier string. Falls back to em-square factors where the boxes are unsupported.
interface FontMetrics {
    ascent: number;
    descent: number;
}
const fontMetricsCache = new Map<string, FontMetrics>();

export function fontMetrics(cx: CanvasRenderingContext2D, font: string, size: number): FontMetrics {
    const hit = fontMetricsCache.get(font);
    if (hit) return hit;
    cx.font = font;
    const m = cx.measureText("Hg");
    const out = {
        ascent: m.fontBoundingBoxAscent ?? size * 0.8,
        descent: m.fontBoundingBoxDescent ?? size * 0.2,
    };
    fontMetricsCache.set(font, out);
    return out;
}

/** Wrap a plain leaf as one run so the single runs path serves everything. */
export function leafForRuns(leaf: TextLeaf): TextLeaf {
    return leaf.runs && leaf.runs.length > 0 ? leaf : { ...leaf, runs: [{ text: leaf.text }] };
}

interface Piece {
    text: string;
    from: number;
    font: string;
    run: Run;
}

type Token =
    | { kind: "box" | "glue"; pieces: Piece[] }
    | { kind: "break"; pieces: Piece[]; at: number };

// boxes may span runs, glue collapses whitespace; `from` is the piece's source offset
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

    let base = 0;
    for (const run of leaf.runs ?? []) {
        const font = runFont(leaf, run);
        const re = /\n|[^\S\n]+|[^\s]+/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(run.text))) {
            const part = m[0];
            const from = base + m.index;
            if (part === "\n") {
                flushWord();
                tokens.push({ kind: "break", pieces: [], at: from });
            } else if (/\S/.test(part)) {
                word.push({ text: part, from, font, run });
            } else {
                pushGlue({ text: " ", from, font, run });
            }
        }
        base += run.text.length;
    }
    flushWord();
    return tokens;
}

function toFrag(cx: CanvasRenderingContext2D, piece: Piece, x: number): TextFrag {
    cx.font = piece.font;
    const width = cx.measureText(piece.text).width;
    const r = piece.run;
    return {
        text: piece.text,
        from: piece.from,
        font: piece.font,
        color: r.color,
        underline: !!r.underline,
        strike: !!r.strike,
        code: !!r.code,
        highlight: r.highlight,
        link: r.link,
        x,
        width,
    };
}

// x offsets are line-local, pre-align
export function layoutRuns(
    cx: CanvasRenderingContext2D,
    leaf: TextLeaf,
    maxWidth: number,
): RunLayout {
    const lineHeight = leaf.lineHeight ?? leaf.size * LINE_HEIGHT_FACTOR;
    const noWrap = leaf.wrap === "none" || !Number.isFinite(maxWidth);
    const tokens = tokenize(leaf);
    const fm = fontMetrics(cx, `${leaf.weight ?? 400} ${leaf.size}px ${leaf.fontId}`, leaf.size);
    // where all four backends already paint: the midline anchor resolved to an alphabetic baseline
    const baseline = (lineHeight - (fm.ascent + fm.descent)) / 2 + fm.ascent;

    const lines: TextLine[] = [];
    let frags: TextFrag[] = [];
    let width = 0;
    let pendingGlue: Piece | undefined;
    let lineStart = 0;

    const endLine = (nextStart: number): void => {
        const last = frags[frags.length - 1];
        lines.push({
            from: frags[0]?.from ?? lineStart,
            to: last ? last.from + last.text.length : lineStart,
            y: lines.length * lineHeight,
            baseline,
            width,
            frags,
        });
        frags = [];
        width = 0;
        pendingGlue = undefined;
        lineStart = nextStart;
    };
    const place = (piece: Piece): void => {
        const frag = toFrag(cx, piece, width);
        frags.push(frag);
        width += frag.width;
    };

    for (const tok of tokens) {
        if (tok.kind === "break") {
            endLine(tok.at + 1);
            continue;
        }
        if (tok.kind === "glue") {
            pendingGlue = tok.pieces[0];
            continue;
        }
        // a word (may cross run/font boundaries) is one indivisible box
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
            endLine(tok.pieces[0]!.from); // wrap: the leading space is dropped at the new line's start
            for (const p of tok.pieces) place(p);
        } else {
            if (pendingGlue && hasLead) place(pendingGlue);
            pendingGlue = undefined;
            for (const p of tok.pieces) place(p);
        }
    }
    endLine(0);

    const max = leaf.maxLines;
    if (max && max > 0 && lines.length > max) truncate(cx, leaf, lines, max, maxWidth);

    const rawWidth = Math.max(0, ...lines.map((l) => l.width));
    return {
        lines,
        width: noWrap ? rawWidth : Math.min(rawWidth, maxWidth),
        height: lines.length * lineHeight,
        lineHeight,
    };
}

const ELLIPSIS = "…";

// Clamp to `max` lines. Ellipsis (the default) trims the last kept line until the glyph fits and
// appends it as its own fragment: base styling only, never the trimmed fragment's link or
// decorations — a decorated ellipsis reads as content, a clickable one promises what it hides.
function truncate(
    cx: CanvasRenderingContext2D,
    leaf: TextLeaf,
    lines: TextLine[],
    max: number,
    maxWidth: number,
): void {
    lines.length = max;
    if (leaf.overflow === "clip") return;
    const last = lines[max - 1]!;
    const baseFont = `${leaf.weight ?? 400} ${leaf.size}px ${leaf.fontId}`;
    const frags = [...last.frags];
    const fontOf = (): string => frags[frags.length - 1]?.font ?? baseFont;
    cx.font = fontOf();
    let ellW = cx.measureText(ELLIPSIS).width;
    let width = frags.reduce((wsum, f) => wsum + f.width, 0);
    while (frags.length && width + ellW > maxWidth) {
        const f = frags[frags.length - 1]!;
        if (f.text.length > 1) {
            const text = f.text.slice(0, -1);
            cx.font = f.font;
            const w = cx.measureText(text).width;
            width -= f.width - w;
            frags[frags.length - 1] = { ...f, text, width: w };
        } else {
            width -= f.width;
            frags.pop();
            cx.font = fontOf();
            ellW = cx.measureText(ELLIPSIS).width;
        }
    }
    const tail = frags[frags.length - 1];
    const cut = tail ? tail.from + tail.text.length : last.from;
    frags.push({
        text: ELLIPSIS,
        from: cut,
        font: tail?.font ?? baseFont,
        color: tail?.color,
        underline: false,
        strike: false,
        code: false,
        x: width,
        width: ellW,
    });
    lines[max - 1] = { ...last, to: cut, width: width + ellW, frags };
}

const measureUncached = (leaf: TextLeaf, maxWidth: number): Measured => {
    const cx = getCtx();
    const laid = layoutRuns(cx, leafForRuns(leaf), maxWidth);
    const fm = fontMetrics(cx, `${leaf.weight ?? 400} ${leaf.size}px ${leaf.fontId}`, leaf.size);
    return {
        width: laid.width,
        height: laid.height,
        lines: laid.lines,
        ascent: fm.ascent,
        descent: fm.descent,
    };
};

// memoized measurement, keyed on metric-affecting inputs only; cleared on font load (below)
const measureCache = new Map<string, Measured>();
const MEASURE_CACHE_CAP = 6000;

function measureKey(leaf: TextLeaf, maxWidth: number): string {
    const mw = leaf.wrap === "none" || !Number.isFinite(maxWidth) ? "*" : maxWidth;
    const base = `${leaf.size};${leaf.weight ?? 400};${leaf.lineHeight ?? 0};${leaf.wrap};${mw};${leaf.maxLines ?? 0};${leaf.overflow ?? ""};${leaf.fontId}`;
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
        // FIFO-evict the oldest quarter (Map preserves insertion order)
        let n = MEASURE_CACHE_CAP >> 2;
        for (const k of measureCache.keys()) {
            measureCache.delete(k);
            if (--n <= 0) break;
        }
    }
    measureCache.set(key, result);
    return result;
};

// fonts load after first paint → drop the cache so the next layout re-measures with real metrics
if (typeof document !== "undefined" && document.fonts) {
    document.fonts.addEventListener("loadingdone", () => {
        clearMeasureCache();
        fontMetricsCache.clear();
    });
}
