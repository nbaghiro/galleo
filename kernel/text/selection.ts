export interface Point {
    para: number;
    offset: number; // UTF-16 offset; caret moves by grapheme via Intl.Segmenter
}

export interface Selection {
    anchor: Point;
    focus: Point;
    affinity: "up" | "down"; // disambiguates the line-wrap boundary
}

// Document order between two points: <0 if a precedes b, 0 if equal, >0 if a follows b.
export function comparePoints(a: Point, b: Point): number {
    return a.para - b.para || a.offset - b.offset;
}

export function isCollapsed(sel: Selection): boolean {
    return comparePoints(sel.anchor, sel.focus) === 0;
}

// The selection's endpoints in document order (start ≤ end), regardless of drag direction.
export function orderedPoints(sel: Selection): { start: Point; end: Point } {
    return comparePoints(sel.anchor, sel.focus) <= 0
        ? { start: sel.anchor, end: sel.focus }
        : { start: sel.focus, end: sel.anchor };
}

// The [from, to) offset range within a single paragraph, or undefined if the selection spans paras
// (mark ops in the first rich-text slice are single-paragraph). Callers pass the paragraph index.
export function offsetRange(
    sel: Selection,
    para: number,
): { from: number; to: number } | undefined {
    const { start, end } = orderedPoints(sel);
    if (start.para !== para || end.para !== para) return undefined;
    return { from: start.offset, to: end.offset };
}
