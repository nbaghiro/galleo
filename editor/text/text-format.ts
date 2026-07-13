import { createSignal } from "solid-js";
import type { MarkType } from "@model/text";

type Range = { from: number; to: number };
type MarkOp = "toggle" | "set" | "clear";

export const [textSelection, setTextSelection] = createSignal<Range | null>(null);
export const [activeMarks, setActiveMarks] = createSignal<MarkType[]>([]);
export const [activeValues, setActiveValues] = createSignal<Partial<Record<MarkType, string>>>({});

let opFn: ((op: MarkOp, type: MarkType, value?: string, range?: Range) => void) | null = null;
// The field also registers a REPLACE-range handler (AI rewrite/translate), kept on the bridge so the AI
// menu can apply a result without touching the field's DOM.
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

export function toggleTextMark(type: MarkType): void {
    opFn?.("toggle", type);
}
// color/hl/link — apply a value. `range` acts on a selection captured before focus moved to a toolbar input.
export function setTextMark(type: MarkType, value: string, range?: Range): void {
    opFn?.("set", type, value, range);
}
export function clearTextMark(type: MarkType, range?: Range): void {
    opFn?.("clear", type, undefined, range);
}
