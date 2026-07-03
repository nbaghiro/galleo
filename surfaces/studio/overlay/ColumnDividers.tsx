import type { Rect } from "@engine/node";
import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import { fallbackTemplate, TEMPLATES } from "@elements/templates";
import { cellRegionId } from "@model/address";
import { applyLiveEdit, liveEdit, setLiveEdit } from "../editing/manipulate";
import { commit, editor, editorAccent, regions, selection, stageEl } from "../editor";

// Draggable dividers between a section's columns (canvas coords). Shown when the section or one of its
// cells is selected; dragging reallocates the two adjacent column fractions (their combined width is
// preserved). Live-previews via the shared liveEdit signal, committing on release.
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const round = (n: number): number => Math.round(n * 1000) / 1000;

export const ColumnDividers: Component = () => {
    const ctx = createMemo(() => {
        const sel = selection();
        const sid =
            sel?.kind === "section" ? sel.section : sel?.kind === "cell" ? sel.section : null;
        if (!sid) return null;
        const section = editor.artifact.sections.find((s) => s.id === sid);
        if (!section) return null;
        const tmpl = TEMPLATES[section.grid] ?? fallbackTemplate;
        if (tmpl.cells.length < 2) return null;
        const boxes = tmpl.cells.map(
            (k) => regions().find((r) => r.id === cellRegionId(sid, k))?.box,
        );
        if (boxes.some((b) => !b)) return null;
        const b = boxes as Rect[];
        const rowLeft = b[0]!.x;
        const rowWidth = b[b.length - 1]!.x + b[b.length - 1]!.w - rowLeft;
        const fractions = b.map((x) => x.w / rowWidth);
        const top = Math.min(...b.map((x) => x.y));
        const bottom = Math.max(...b.map((x) => x.y + x.h));
        return { sid, b, rowLeft, rowWidth, fractions, top, h: bottom - top };
    });

    const dividers = createMemo(() => {
        const c = ctx();
        if (!c) return [];
        return c.b.slice(0, -1).map((box, i) => ({
            i,
            x: (box.x + box.w + c.b[i + 1]!.x) / 2,
            top: c.top,
            h: c.h,
        }));
    });

    const onDown = (e: PointerEvent, i: number): void => {
        e.preventDefault();
        e.stopPropagation();
        const c = ctx();
        const stage = stageEl();
        if (!c || !stage) return;
        const rect = stage.getBoundingClientRect();
        const base = c.fractions;
        const before = base.slice(0, i).reduce((a, x) => a + x, 0);
        const combined = base[i]! + base[i + 1]!;
        const move = (ev: PointerEvent): void => {
            const boundary = (ev.clientX - rect.left - c.rowLeft) / c.rowWidth;
            const fi = clamp(boundary - before, 0.12, combined - 0.12);
            const widths = [...base];
            widths[i] = round(fi);
            widths[i + 1] = round(combined - fi);
            setLiveEdit({ kind: "columns", section: c.sid, widths });
        };
        const up = (): void => {
            const edit = liveEdit();
            setLiveEdit(null);
            if (edit) commit(applyLiveEdit(editor.artifact, edit));
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    return (
        <Show when={ctx()}>
            <For each={dividers()}>
                {(d) => (
                    <div
                        class="group absolute z-10 flex justify-center"
                        style={{
                            left: `${d.x - 6}px`,
                            top: `${d.top}px`,
                            width: "12px",
                            height: `${d.h}px`,
                            cursor: "col-resize",
                            "touch-action": "none",
                        }}
                        onPointerDown={(e) => onDown(e, d.i)}
                    >
                        <div
                            class="h-full w-[2px] rounded-full opacity-40 transition-opacity group-hover:opacity-100"
                            style={{ background: editorAccent() }}
                        />
                    </div>
                )}
            </For>
        </Show>
    );
};
