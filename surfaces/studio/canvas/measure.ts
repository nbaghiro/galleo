import type { Measured, Run, TextLeaf } from "@engine/node";

// Canvas-based text measurement injected into the engine (keeps the kernel DOM-free).

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

export const measureText = (leaf: TextLeaf, maxWidth: number): Measured => {
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
