// Inline rich-text editing: the contenteditable overlay editor + the marks/runs rich-text model it drives.

import type { ElementAddress } from "@model/target";
import type { Component, JSX } from "solid-js";
import { createMemo, onCleanup, onMount, Show } from "solid-js";
import { sectionContentTokens } from "@elements/compose";
import { getElementAt, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { elementRegionId } from "@model/target";
import type { Mark, MarkType } from "@model/text";
import {
    activeMarks as computeActiveMarks,
    applyMark as addMark,
    removeMark,
    toggleMark,
    normalizeMarks,
    toRuns,
} from "@model/text";
import {
    editCaret,
    editing,
    editor,
    editorAccent,
    editorTokens,
    regions,
    setArtifactLive,
    stopEditing,
} from "../editor";
import { ctxFor } from "../canvas/render";
import {
    registerTextField,
    setActiveMarks,
    setActiveValues,
    setTextSelection,
    unregisterTextField,
} from "./text-format";
import type { Run } from "@engine/node";

type TextFields = { text?: string; marks?: Mark[] } & Record<string, unknown>;

// Map a viewport point to a text caret Range (Chrome/Safari vs Firefox APIs), typed without `any`.
interface CaretDoc {
    caretRangeFromPoint?(x: number, y: number): Range | null;
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
}
function caretRangeAtPoint(x: number, y: number): Range | null {
    const d = document as Document & CaretDoc;
    if (d.caretRangeFromPoint) return d.caretRangeFromPoint(x, y);
    const cp = d.caretPositionFromPoint?.(x, y);
    if (!cp) return null;
    const r = document.createRange();
    r.setStart(cp.offsetNode, cp.offset);
    r.collapse(true);
    return r;
}

// A contenteditable overlay styled to exactly match the engine-rendered text: the browser supplies a
// real caret + IME + selection, marks render as styled spans, edits flow live into the model, and the
// engine re-lays-out beneath. The format bar toggles marks over the live selection (see text-format).
const EditingField: Component<{ address: ElementAddress }> = (props) => {
    let el!: HTMLDivElement;

    const inst = createMemo(() => getElementAt(editor.artifact, props.address));
    const fields = (): TextFields => (inst()?.data ?? {}) as TextFields;
    const leaf = createMemo(() => {
        const i = inst();
        const spec = i ? getElement(i.type) : undefined;
        if (!i || !spec?.richText) return null;
        // Match the over-image recoloring composeSection applies, so the editing overlay isn't dark/faded
        // over a dark (image) section background.
        const base = editorTokens();
        const section = editor.artifact.sections.find((s) => s.id === props.address.section);
        const tokens = section ? sectionContentTokens(section, base) : base;
        return spec.layout(i.data, ctxFor(200, tokens)).text ?? null;
    });
    const box = createMemo(
        () => regions().find((r) => r.id === elementRegionId(props.address))?.box ?? null,
    );

    const syncSel = (): void => {
        const off = getOffsets(el);
        if (!off) {
            setTextSelection(null);
            setActiveMarks([]);
            setActiveValues({});
            return;
        }
        setTextSelection(off);
        const marks = fields().marks ?? [];
        setActiveMarks(computeActiveMarks(marks, off.from, off.to));
        // Value marks (color/hl/link) covering the selection — for the pickers' preselect + preview.
        const values: Partial<Record<MarkType, string>> = {};
        for (const t of ["color", "hl", "link"] as MarkType[]) {
            const m = marks.find(
                (x) => x.type === t && x.value && x.from <= off.from && x.to >= off.to,
            );
            if (m?.value) values[t] = m.value;
        }
        setActiveValues(values);
    };

    // Run a mark op over a range — the live selection, or an explicit range captured before focus moved
    // to a toolbar field (the link URL input). Rewrites the model marks, re-renders the styled DOM, and
    // restores focus + selection so the caret/highlight stays put.
    const runMark = (
        op: "toggle" | "set" | "clear",
        type: MarkType,
        value?: string,
        range?: { from: number; to: number },
    ): void => {
        const i = inst();
        if (!i) return;
        const off = range ?? getOffsets(el);
        if (!off) return;
        const data = fields();
        const cur = data.marks ?? [];
        const marks =
            op === "toggle"
                ? toggleMark(cur, off.from, off.to, type, value)
                : op === "set"
                  ? addMark(cur, off.from, off.to, type, value)
                  : removeMark(cur, off.from, off.to, type);
        setArtifactLive(updateDataAt(editor.artifact, props.address, { ...data, marks }));
        renderMarks(el, data.text ?? "", marks);
        el.focus();
        setOffsets(el, off.from, off.to);
        syncSel();
    };

    onMount(() => {
        const data = fields();
        renderMarks(el, data.text ?? "", data.marks ?? []);
        el.focus();
        const sel = window.getSelection();
        let range: Range | null = null;
        // Place the caret where the user clicked; fall back to the end of the text.
        const caret = editCaret();
        if (caret) {
            const r = caretRangeAtPoint(caret.x, caret.y);
            if (r && el.contains(r.startContainer)) range = r;
        }
        if (!range) {
            range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
        }
        sel?.removeAllRanges();
        sel?.addRange(range);

        registerTextField(runMark);
        document.addEventListener("selectionchange", syncSel);
        syncSel();
        onCleanup(() => {
            document.removeEventListener("selectionchange", syncSel);
            unregisterTextField();
        });
    });

    const onInput = (): void => {
        const i = inst();
        if (!i) return;
        const { text, marks } = readMarks(el);
        setArtifactLive(updateDataAt(editor.artifact, props.address, { ...fields(), text, marks }));
    };

    const onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
            e.preventDefault();
            stopEditing();
            return;
        }
        // Standard formatting shortcuts, applied over the model (not the browser's execCommand).
        if (e.metaKey || e.ctrlKey) {
            const k = e.key.toLowerCase();
            const type: MarkType | null =
                k === "b" ? "b" : k === "i" ? "i" : k === "u" ? "u" : null;
            if (type) {
                e.preventDefault();
                runMark("toggle", type);
            }
        }
    };

    const style = createMemo((): JSX.CSSProperties => {
        const b = box();
        const l = leaf();
        if (!b || !l) return { display: "none" };
        return {
            left: `${b.x}px`,
            top: `${b.y}px`,
            width: `${b.w}px`,
            font: `${l.weight ?? 400} ${l.size}px ${l.fontId}`,
            "line-height": `${l.lineHeight ?? l.size * 1.35}px`,
            color: l.color ?? "#1a1a1a",
            "text-align": l.align ?? "start",
            "white-space": l.wrap === "none" ? "pre" : "pre-wrap",
            "caret-color": editorAccent(),
        };
    });

    return (
        <div
            ref={el}
            contentEditable={true}
            spellcheck={false}
            class="absolute z-10 outline-none"
            style={style()}
            onInput={onInput}
            onKeyDown={onKeyDown}
            onBlur={(e) => {
                // Keep editing alive when focus moves into the format bar (e.g. the link URL input).
                const rt = e.relatedTarget as HTMLElement | null;
                if (rt?.closest("[data-galleo-toolbar]")) return;
                // If editing already switched to another element (clicking a different text element), this
                // is a stale blur from the outgoing field — don't cancel the incoming edit.
                const cur = editing();
                if (cur && elementRegionId(cur) !== elementRegionId(props.address)) return;
                stopEditing();
            }}
            onPointerDown={(e) => e.stopPropagation()}
        />
    );
};

export const TextEditor: Component = () => (
    <Show when={editing()}>{(addr) => <EditingField address={addr()} />}</Show>
);

// DOM ⇄ marks bridge for the inline text editor. The model (a plain string + offset-range marks) is the
// source of truth; this renders it into the contenteditable as styled spans, reads the edited DOM back
// into {text, marks}, and maps the browser selection to/from character offsets — so the format bar can
// toggle marks over the current selection. We own the span markup (a `data-m` descriptor per run), so
// read-back is exact rather than parsing arbitrary contenteditable soup.

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function hasStyle(r: Run): boolean {
    return !!(
        r.bold ||
        r.italic ||
        r.underline ||
        r.strike ||
        r.code ||
        r.color ||
        r.link ||
        r.highlight
    );
}

function descriptor(r: Run): string {
    const t: string[] = [];
    if (r.bold) t.push("b");
    if (r.italic) t.push("i");
    if (r.underline) t.push("u");
    if (r.strike) t.push("s");
    if (r.code) t.push("code");
    if (r.color) t.push(`color=${r.color}`);
    if (r.highlight) t.push(`hl=${r.highlight}`);
    if (r.link) t.push(`link=${r.link}`);
    return t.join(" ");
}

function styleSpan(span: HTMLSpanElement, r: Run): void {
    if (r.bold) span.style.fontWeight = "700";
    if (r.italic) span.style.fontStyle = "italic";
    const deco = [r.underline && "underline", r.strike && "line-through"].filter(Boolean).join(" ");
    if (deco) span.style.textDecoration = deco;
    if (r.code) {
        span.style.fontFamily = MONO;
        span.style.background = "rgba(127,127,127,0.14)";
    }
    if (r.color) span.style.color = r.color;
    if (r.highlight) span.style.background = r.highlight;
    if (r.link) span.style.textDecoration = deco ? `${deco} underline` : "underline";
}

function appendRun(parent: Node, r: Run): void {
    // Split on hard breaks so \n becomes <br> (and survives read-back as \n).
    const pieces = r.text.split("\n");
    pieces.forEach((piece, i) => {
        if (i > 0) parent.appendChild(document.createElement("br"));
        if (!piece) return;
        if (!hasStyle(r)) {
            parent.appendChild(document.createTextNode(piece));
            return;
        }
        const span = document.createElement("span");
        styleSpan(span, r);
        span.setAttribute("data-m", descriptor(r));
        span.textContent = piece;
        parent.appendChild(span);
    });
}

// Replace the field's DOM with the styled runs for {text, marks}.
export function renderMarks(el: HTMLElement, text: string, marks: Mark[]): void {
    const frag = document.createDocumentFragment();
    for (const run of toRuns(text, marks)) appendRun(frag, run);
    el.replaceChildren(frag);
}

function parseDesc(attr: string | null): { type: MarkType; value?: string }[] {
    if (!attr) return [];
    return attr
        .split(" ")
        .filter(Boolean)
        .map((tok) => {
            const eq = tok.indexOf("=");
            if (eq === -1) return { type: tok as MarkType };
            return { type: tok.slice(0, eq) as MarkType, value: tok.slice(eq + 1) };
        });
}

function mergeMarks(
    a: { type: MarkType; value?: string }[],
    b: { type: MarkType; value?: string }[],
): { type: MarkType; value?: string }[] {
    const byType = new Map<MarkType, { type: MarkType; value?: string }>();
    for (const m of a) byType.set(m.type, m);
    for (const m of b) byType.set(m.type, m); // inner span wins
    return [...byType.values()];
}

// Read the (possibly user-mutated) DOM back into {text, marks}. Each contiguous text node inherits the
// marks of its ancestor spans; adjacent segments sharing a mark are coalesced into ranges.
export function readMarks(el: HTMLElement): { text: string; marks: Mark[] } {
    let text = "";
    const segs: { from: number; to: number; marks: { type: MarkType; value?: string }[] }[] = [];
    const walk = (node: Node, active: { type: MarkType; value?: string }[]): void => {
        node.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
                const t = (child as Text).data;
                if (t.length)
                    segs.push({ from: text.length, to: text.length + t.length, marks: active });
                text += t;
            } else if (child.nodeName === "BR") {
                text += "\n";
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const own = parseDesc((child as HTMLElement).getAttribute("data-m"));
                walk(child, own.length ? mergeMarks(active, own) : active);
            }
        });
    };
    walk(el, []);

    const key = (m: { type: MarkType; value?: string }): string => `${m.type} ${m.value ?? ""}`;
    const seen = new Map<string, { type: MarkType; value?: string }>();
    for (const s of segs) for (const m of s.marks) seen.set(key(m), m);

    const marks: Mark[] = [];
    for (const [k, m] of seen) {
        let start: number | null = null;
        let end = 0;
        for (const s of segs) {
            if (s.marks.some((x) => key(x) === k)) {
                if (start === null) start = s.from;
                end = s.to;
            } else if (start !== null) {
                marks.push({ from: start, to: end, type: m.type, value: m.value });
                start = null;
            }
        }
        if (start !== null) marks.push({ from: start, to: end, type: m.type, value: m.value });
    }
    return { text, marks: normalizeMarks(marks) };
}

// --- selection ⇄ character offsets ---

function textLen(node: Node): number {
    let n = 0;
    node.childNodes.forEach((c) => {
        if (c.nodeType === Node.TEXT_NODE) n += (c as Text).data.length;
        else if (c.nodeName === "BR") n += 1;
        else n += textLen(c);
    });
    return n;
}

function offsetOfPoint(el: HTMLElement, node: Node, nodeOffset: number): number {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.setEnd(node, nodeOffset);
    return textLen(range.cloneContents());
}

// The current selection as {from, to} character offsets within the field, or null if it's elsewhere.
export function getOffsets(el: HTMLElement): { from: number; to: number } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
    const a = offsetOfPoint(el, r.startContainer, r.startOffset);
    const b = offsetOfPoint(el, r.endContainer, r.endOffset);
    return { from: Math.min(a, b), to: Math.max(a, b) };
}

function pointAt(el: HTMLElement, target: number): { node: Node; offset: number } {
    let remaining = target;
    let result: { node: Node; offset: number } | null = null;
    const rec = (node: Node): boolean => {
        for (const c of Array.from(node.childNodes)) {
            if (c.nodeType === Node.TEXT_NODE) {
                const len = (c as Text).data.length;
                if (remaining <= len) {
                    result = { node: c, offset: remaining };
                    return true;
                }
                remaining -= len;
            } else if (c.nodeName === "BR") {
                if (remaining === 0) {
                    const parent = c.parentNode!;
                    result = {
                        node: parent,
                        offset: Array.from(parent.childNodes).indexOf(c as ChildNode),
                    };
                    return true;
                }
                remaining -= 1;
            } else if (rec(c)) {
                return true;
            }
        }
        return false;
    };
    rec(el);
    return result ?? { node: el, offset: el.childNodes.length };
}

// Restore a selection spanning [from, to) character offsets.
export function setOffsets(el: HTMLElement, from: number, to: number): void {
    const p1 = pointAt(el, from);
    const p2 = pointAt(el, to);
    const range = document.createRange();
    range.setStart(p1.node, p1.offset);
    range.setEnd(p2.node, p2.offset);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
}
