import type { ElementAddress } from "@model/address";
import type { Component, JSX } from "solid-js";
import { createMemo, onMount, Show } from "solid-js";
import { getElementAt, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/registry";
import { elementRegionId } from "@model/address";
import { resolveTheme } from "@themes/library";
import { editCaret, editing, editor, regions, setArtifactLive, stopEditing } from "./editor";
import { ctxFor } from "./render";

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
// real caret + IME + selection, edits flow live into the model, and the engine re-lays-out beneath.
const EditingField: Component<{ address: ElementAddress }> = (props) => {
    let el!: HTMLDivElement;

    const inst = createMemo(() => getElementAt(editor.artifact, props.address));
    const leaf = createMemo(() => {
        const i = inst();
        const spec = getElement("text");
        if (!i || i.type !== "text" || !spec) return null;
        return (
            spec.layout(i.data, ctxFor(200, resolveTheme(editor.artifact.theme).tokens)).text ??
            null
        );
    });
    const box = createMemo(
        () => regions().find((r) => r.id === elementRegionId(props.address))?.box ?? null,
    );

    onMount(() => {
        el.textContent = ((inst()?.data ?? {}) as { text?: string }).text ?? "";
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
    });

    const onInput = (): void => {
        const i = inst();
        if (!i) return;
        setArtifactLive(
            updateDataAt(editor.artifact, props.address, {
                ...(i.data as Record<string, unknown>),
                text: el.textContent ?? "",
            }),
        );
    };

    const onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
            e.preventDefault();
            stopEditing();
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
            "white-space": l.wrap === "none" ? "nowrap" : "normal",
            "caret-color": resolveTheme(editor.artifact.theme).tokens.accent,
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
            onBlur={() => stopEditing()}
            onPointerDown={(e) => e.stopPropagation()}
        />
    );
};

export const TextEditor: Component = () => (
    <Show when={editing()}>{(addr) => <EditingField address={addr()} />}</Show>
);
