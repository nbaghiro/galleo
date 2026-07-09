import { createSignal } from "solid-js";
import type { MarkType } from "@model/text";

// Shared bridge between the active inline text field (which owns the contenteditable) and the format
// bar in the ContextBar. The field registers a mark-op handler and publishes the live selection, the
// mark types active over it (pressed state), and the value marks (color/hl/link) covering it (so the
// pickers can preselect + preview). Boolean marks toggle; value marks set/clear over a range.

type Range = { from: number; to: number };
type MarkOp = "toggle" | "set" | "clear";

export const [textSelection, setTextSelection] = createSignal<Range | null>(null);
export const [activeMarks, setActiveMarks] = createSignal<MarkType[]>([]);
export const [activeValues, setActiveValues] = createSignal<Partial<Record<MarkType, string>>>({});

let opFn: ((op: MarkOp, type: MarkType, value?: string, range?: Range) => void) | null = null;
// The field also registers how to REPLACE a character range with new text (the AI rewrite/translate action):
// splice the model + re-render the styled DOM + reselect the new span. Kept on the bridge so the text AI menu
// (in the format bar) can apply a result without reaching into the field's DOM.
let replaceFn: ((from: number, to: number, text: string) => void) | null = null;

export function registerTextField(
    fn: (op: MarkOp, type: MarkType, value?: string, range?: Range) => void,
): void {
    opFn = fn;
}
export function registerTextReplace(fn: (from: number, to: number, text: string) => void): void {
    replaceFn = fn;
}
export function replaceTextRange(from: number, to: number, text: string): void {
    replaceFn?.(from, to, text);
}
export function unregisterTextField(): void {
    opFn = null;
    replaceFn = null;
    setTextSelection(null);
    setActiveMarks([]);
    setActiveValues({});
}

// b/i/u/s/code — flip on the current selection.
export function toggleTextMark(type: MarkType): void {
    opFn?.("toggle", type);
}
// color/hl/link — apply a value. `range` lets the caller act on a selection captured before focus moved
// to a toolbar input (the link URL field).
export function setTextMark(type: MarkType, value: string, range?: Range): void {
    opFn?.("set", type, value, range);
}
export function clearTextMark(type: MarkType, range?: Range): void {
    opFn?.("clear", type, undefined, range);
}
