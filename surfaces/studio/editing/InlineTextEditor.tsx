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
import { getOffsets, readMarks, renderMarks, setOffsets } from "./rich";
import {
    registerTextField,
    setActiveMarks,
    setActiveValues,
    setTextSelection,
    unregisterTextField,
} from "./text-format";

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
                stopEditing();
            }}
            onPointerDown={(e) => e.stopPropagation()}
        />
    );
};

export const TextEditor: Component = () => (
    <Show when={editing()}>{(addr) => <EditingField address={addr()} />}</Show>
);
