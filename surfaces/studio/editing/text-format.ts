import { createSignal } from "solid-js";
import type { MarkType } from "../../../kernel/text/model";

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

export function registerTextField(
    fn: (op: MarkOp, type: MarkType, value?: string, range?: Range) => void,
): void {
    opFn = fn;
}
export function unregisterTextField(): void {
    opFn = null;
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
