// Engine-native rich-text core (a hidden contenteditable is only an input/IME sink).

// a contiguous styled slice; each flag only turns a style ON (never off)
export interface Run {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
    code?: boolean;
    color?: string; // hex
    link?: string; // href; carried for hit-testing/editing, not painted here
    highlight?: string; // background color (hex)
}

export type MarkType = "b" | "i" | "u" | "s" | "code" | "link" | "color" | "hl";

export interface Mark {
    from: number;
    to: number;
    type: MarkType;
    value?: string; // href for link, hex for color/hl
}

// clamp [from, to) to bounds, dropping empty/inverted ranges
function span(m: Mark, len: number): { from: number; to: number } | undefined {
    const from = Math.max(0, Math.min(m.from, len));
    const to = Math.max(0, Math.min(m.to, len));
    return to > from ? { from, to } : undefined;
}

// fold a mark onto a run it fully covers; later marks win on value fields
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

// merge adjacent runs with identical styles
function coalesce(runs: Run[]): Run[] {
    const out: Run[] = [];
    for (const r of runs) {
        const last = out[out.length - 1];
        if (last && sameStyle(last, r)) last.text += r.text;
        else out.push({ ...r });
    }
    return out;
}

// string + marks → styled runs; overlapping marks flatten at each boundary
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

// merge same-type/value marks that overlap or touch; drop empty; sort by start
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

// mark types that fully cover [from, to) (a toolbar's "active" state)
export function activeMarks(marks: Mark[], from: number, to: number): MarkType[] {
    if (to <= from) {
        // collapsed caret: active if any mark contains the caret offset
        return unique(
            marks.filter((m) => m.from <= from && m.to >= from && m.to > m.from).map((m) => m.type),
        );
    }
    const types = unique(marks.map((m) => m.type));
    return types.filter((t) => covered(marks, from, to, t));
}

// add a mark over [from, to); returns a new normalized list (input untouched)
export function applyMark(
    marks: Mark[],
    from: number,
    to: number,
    type: MarkType,
    value?: string,
): Mark[] {
    if (to <= from) return marks.slice();
    // value-bearing marks (link/color/hl) replace a prior same-type mark over the range
    const base = value !== undefined ? removeMark(marks, from, to, type) : marks.slice();
    return normalizeMarks([...base, { from, to, type, value }]);
}

// clear type over [from, to), splitting marks that straddle the range
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

// toggle type over [from, to): remove if fully covering, else add
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
    // every offset must sit inside some mark of this type
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

// replace [from, to) with insert, adjusting marks (straddling split; whole-range re-applies)
export function spliceText(
    text: string,
    marks: Mark[],
    from: number,
    to: number,
    insert: string,
): { text: string; marks: Mark[] } {
    const a = Math.max(0, Math.min(from, text.length));
    const b = Math.max(a, Math.min(to, text.length));
    const nextText = text.slice(0, a) + insert + text.slice(b);
    const delta = insert.length - (b - a);
    const newTo = a + insert.length;
    // marks covering [a, b) → carried onto the inserted span
    const cover = marks
        .filter((m) => m.from <= a && m.to >= b && m.to > m.from)
        .map((m) => ({ type: m.type, value: m.value }));
    const out: Mark[] = [];
    for (const m of marks) {
        if (m.to <= a) {
            out.push({ ...m });
        } else if (m.from >= b) {
            out.push({ ...m, from: m.from + delta, to: m.to + delta });
        } else {
            if (m.from < a) out.push({ ...m, to: a }); // left tail
            if (m.to > b) out.push({ ...m, from: b + delta, to: m.to + delta }); // right tail
        }
    }
    for (const c of cover) out.push({ from: a, to: newTo, type: c.type, value: c.value });
    return { text: nextText, marks: normalizeMarks(out) };
}

export interface Point {
    para: number;
    offset: number; // UTF-16 offset; caret moves by grapheme via Intl.Segmenter
}

export interface Selection {
    anchor: Point;
    focus: Point;
    affinity: "up" | "down"; // disambiguates the line-wrap boundary
}

// document order: <0 a before b, 0 equal, >0 a after b
export function comparePoints(a: Point, b: Point): number {
    return a.para - b.para || a.offset - b.offset;
}

export function isCollapsed(sel: Selection): boolean {
    return comparePoints(sel.anchor, sel.focus) === 0;
}

// endpoints in document order (start ≤ end)
export function orderedPoints(sel: Selection): { start: Point; end: Point } {
    return comparePoints(sel.anchor, sel.focus) <= 0
        ? { start: sel.anchor, end: sel.focus }
        : { start: sel.focus, end: sel.anchor };
}

// [from, to) within one paragraph, or undefined if the selection spans paras
export function offsetRange(
    sel: Selection,
    para: number,
): { from: number; to: number } | undefined {
    const { start, end } = orderedPoints(sel);
    if (start.para !== para || end.para !== para) return undefined;
    return { from: start.offset, to: end.offset };
}
