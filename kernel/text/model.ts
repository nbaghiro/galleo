// Engine-native rich-text core. The engine owns text layout everywhere; a hidden contenteditable is
// only an input/IME sink. Latin-first, desktop-first to start.

import type { Run } from "@engine/node";

export type MarkType = "b" | "i" | "u" | "s" | "code" | "link" | "color" | "hl";

export interface Mark {
    from: number;
    to: number;
    type: MarkType;
    value?: string; // href for link, hex for color/hl
}

// --- source form (marks over a string) → render form (ordered styled runs) ---

// Clamp a mark's [from, to) to the string bounds, dropping empty/inverted ranges.
function span(m: Mark, len: number): { from: number; to: number } | undefined {
    const from = Math.max(0, Math.min(m.from, len));
    const to = Math.max(0, Math.min(m.to, len));
    return to > from ? { from, to } : undefined;
}

// Fold one mark's effect onto a run that it fully covers. Later marks win on value fields.
function stamp(run: Run, m: Mark): void {
    switch (m.type) {
        case "b":
            run.bold = true;
            break;
        case "i":
            run.italic = true;
            break;
        case "u":
            run.underline = true;
            break;
        case "s":
            run.strike = true;
            break;
        case "code":
            run.code = true;
            break;
        case "link":
            if (m.value) run.link = m.value;
            break;
        case "color":
            if (m.value) run.color = m.value;
            break;
        case "hl":
            if (m.value) run.highlight = m.value;
            break;
    }
}

function sameStyle(a: Run, b: Run): boolean {
    return (
        a.bold === b.bold &&
        a.italic === b.italic &&
        a.underline === b.underline &&
        a.strike === b.strike &&
        a.code === b.code &&
        a.color === b.color &&
        a.link === b.link &&
        a.highlight === b.highlight
    );
}

// Merge adjacent runs whose styles are identical, so the output is the minimal contiguous sequence.
function coalesce(runs: Run[]): Run[] {
    const out: Run[] = [];
    for (const r of runs) {
        const last = out[out.length - 1];
        if (last && sameStyle(last, r)) last.text += r.text;
        else out.push({ ...r });
    }
    return out;
}

// Pure converter: a plain string + offset-range marks → an ordered list of styled runs whose texts
// concatenate back to the original string. Overlapping mark ranges are flattened at every boundary
// so each run has a single, well-defined style. No marks (or none that survive clamping) → a single
// unstyled run (or none for empty text), i.e. the plain-text path.
export function toRuns(text: string, marks: Mark[]): Run[] {
    const len = text.length;
    if (len === 0) return [];

    const spans = marks
        .map((m) => ({ mark: m, ...span(m, len) }))
        .filter((s): s is { mark: Mark; from: number; to: number } => s.from !== undefined);

    if (spans.length === 0) return [{ text }];

    const bounds = new Set<number>([0, len]);
    for (const s of spans) {
        bounds.add(s.from);
        bounds.add(s.to);
    }
    const points = [...bounds].sort((a, b) => a - b);

    const runs: Run[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i]!;
        const end = points[i + 1]!;
        if (end <= start) continue;
        const run: Run = { text: text.slice(start, end) };
        for (const s of spans) {
            if (s.from <= start && s.to >= end) stamp(run, s.mark);
        }
        runs.push(run);
    }
    return coalesce(runs);
}

// --- mark read/write helpers (pure; the future inline-format bar's read/write surface) ---

// Merge same-type, same-value marks whose ranges overlap or touch; drop empty ranges; sort by start.
export function normalizeMarks(marks: Mark[]): Mark[] {
    const clean = marks.filter((m) => m.to > m.from);
    clean.sort((a, b) => a.from - b.from || a.to - b.to);
    const out: Mark[] = [];
    for (const m of clean) {
        const prev = out.find(
            (o) => o.type === m.type && o.value === m.value && o.to >= m.from && o.from <= m.to,
        );
        if (prev) prev.to = Math.max(prev.to, m.to);
        else out.push({ ...m });
    }
    out.sort((a, b) => a.from - b.from || a.to - b.to);
    return out;
}

// The mark types that fully cover the whole [from, to) range (a toolbar's "active" state).
export function activeMarks(marks: Mark[], from: number, to: number): MarkType[] {
    if (to <= from) {
        // Collapsed caret: a type is active if any mark contains the caret offset.
        return unique(
            marks.filter((m) => m.from <= from && m.to >= from && m.to > m.from).map((m) => m.type),
        );
    }
    const types = unique(marks.map((m) => m.type));
    return types.filter((t) => covered(marks, from, to, t));
}

// Add a mark of `type` over [from, to). Returns a new, normalized mark list (input untouched).
export function applyMark(
    marks: Mark[],
    from: number,
    to: number,
    type: MarkType,
    value?: string,
): Mark[] {
    if (to <= from) return marks.slice();
    // Value-bearing marks (link/color/hl) replace any prior same-type mark over the range.
    const base = value !== undefined ? removeMark(marks, from, to, type) : marks.slice();
    return normalizeMarks([...base, { from, to, type, value }]);
}

// Clear `type` over [from, to), splitting marks that straddle the range. Returns a new mark list.
export function removeMark(marks: Mark[], from: number, to: number, type: MarkType): Mark[] {
    if (to <= from) return marks.slice();
    const out: Mark[] = [];
    for (const m of marks) {
        if (m.type !== type || m.to <= from || m.from >= to) {
            out.push({ ...m });
            continue;
        }
        if (m.from < from) out.push({ ...m, to: from });
        if (m.to > to) out.push({ ...m, from: to });
    }
    return normalizeMarks(out);
}

// Toggle `type` over [from, to): remove if already fully covering the range, else add.
export function toggleMark(
    marks: Mark[],
    from: number,
    to: number,
    type: MarkType,
    value?: string,
): Mark[] {
    return covered(marks, from, to, type)
        ? removeMark(marks, from, to, type)
        : applyMark(marks, from, to, type, value);
}

function covered(marks: Mark[], from: number, to: number, type: MarkType): boolean {
    if (to <= from) return marks.some((m) => m.type === type && m.from <= from && m.to >= from);
    // Walk the range; every offset must sit inside some mark of this type.
    let cursor = from;
    while (cursor < to) {
        const hit = marks.find(
            (m) => m.type === type && m.from <= cursor && m.to > cursor && m.to > m.from,
        );
        if (!hit) return false;
        cursor = hit.to;
    }
    return true;
}

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}
