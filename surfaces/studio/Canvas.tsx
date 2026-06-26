import type { Region } from "@engine/render-command";
import type { Target } from "@model/address";
import type { Component } from "solid-js";
import { createEffect, createMemo, onCleanup, onMount } from "solid-js";
import { getElementAt } from "@elements/ops";
import { getElement } from "@elements/registry";
import { elementRegionId, parentTarget, parseTarget, specificity } from "@model/address";
import { paint } from "./dom-backend";
import { applyDrop, computeDropTarget, drag, setDrag, startDrag } from "./dnd";
import { commit, editing, editor, redo, setCanvasEl, setEditor, setHover, setRegions, setSelection, startEditing, undo } from "./editor";
import { DropIndicator } from "./DropIndicator";
import { measureText } from "./measure";
import { Overlay } from "./Overlay";
import { SECTION_GAP, layoutSection } from "./render";
import { TextEditor } from "./TextEditor";

const DRAG_THRESHOLD = 4;

// The continuous section canvas: lays out + paints each section, accumulates regions (canvas coords)
// for hit-testing, and drives selection + pointer-based drag-and-drop on top of the engine geometry.
export const Canvas: Component = () => {
    let scrollEl!: HTMLElement;
    let stageEl!: HTMLDivElement;
    let paintHost!: HTMLDivElement;

    let liveRegions: Region[] = [];
    let pending: { target: Target | null; x: number; y: number } | null = null;

    const draw = (): void => {
        if (!paintHost) return;
        const width = stageEl.clientWidth || 800;
        paintHost.replaceChildren();

        // suppress the painted text of the element being edited — only the live overlay shows it
        const editAddr = editing();
        const editId = editAddr ? elementRegionId(editAddr) : null;

        let y = 0;
        const tops: number[] = [];
        const all: Region[] = [];
        for (const section of editor.artifact.sections) {
            const { commands, regions, height } = layoutSection(section, width, measureText);
            const visible = editId ? commands.filter((c) => !(c.kind === "text" && c.id === editId)) : commands;
            const layer = document.createElement("div");
            layer.style.cssText = `left:0;top:${y}px;width:${width}px;height:${height}px`;
            paint(visible, layer);
            layer.style.position = "absolute"; // paint() forces relative; keep layers out of flow
            paintHost.appendChild(layer);
            for (const r of regions) all.push({ id: r.id, box: { x: r.box.x, y: r.box.y + y, w: r.box.w, h: r.box.h } });
            tops.push(y);
            y += height + SECTION_GAP;
        }
        stageEl.style.height = `${y}px`;
        setEditor("sectionTops", tops);
        liveRegions = all;
        setRegions(all);
    };

    const point = (e: { clientX: number; clientY: number }): [number, number] => {
        const r = stageEl.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    };

    const hitTest = (px: number, py: number): Target | null => {
        let best: Target | null = null;
        let bestSpec = -1;
        for (const r of liveRegions) {
            const b = r.box;
            if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) continue;
            const t = parseTarget(r.id);
            if (t && specificity(t) > bestSpec) {
                bestSpec = specificity(t);
                best = t;
            }
        }
        return best;
    };

    const onPointerDown = (e: PointerEvent): void => {
        if (drag() || editing()) return;
        pending = { target: hitTest(...point(e)), x: e.clientX, y: e.clientY };
    };

    const onDoubleClick = (e: MouseEvent): void => {
        const t = hitTest(...point(e));
        if (t?.kind === "element" && getElementAt(editor.artifact, t.address)?.type === "text") {
            setSelection(t);
            startEditing(t.address);
        }
    };

    const onPointerMove = (e: PointerEvent): void => {
        if (drag() || editing()) return; // active drag is driven by the window listeners below
        if (pending?.target?.kind === "element" && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > DRAG_THRESHOLD) {
            const movedType = getElementAt(editor.artifact, pending.target.address)?.type;
            const label = (movedType && getElement(movedType)?.label) || "Move";
            startDrag({ kind: "move", from: pending.target.address }, e.clientX, e.clientY, label);
            pending = null;
            setHover(null);
            return;
        }
        setHover(hitTest(...point(e)));
    };

    const onPointerUp = (): void => {
        if (drag() || editing()) return;
        if (pending) {
            setSelection(pending.target);
            pending = null;
        }
    };

    onMount(() => {
        setCanvasEl(scrollEl);
        const ro = new ResizeObserver(() => draw());
        ro.observe(scrollEl);
        const onKey = (e: KeyboardEvent): void => {
            if (editing()) return; // the inline editor owns the keyboard while active
            if (e.key === "Escape") setSelection((cur) => (cur ? parentTarget(cur) : null));
            else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            }
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => {
            ro.disconnect();
            window.removeEventListener("keydown", onKey);
        });
    });

    // Reads editor.artifact.sections inside draw(), so it re-runs on every content edit.
    createEffect(() => draw());

    // While a drag is active, the cursor lives anywhere on screen — track it on the window.
    const isDragging = createMemo(() => drag() !== null);
    createEffect(() => {
        if (!isDragging()) return;
        const move = (e: PointerEvent): void => {
            const target = computeDropTarget(liveRegions, ...point(e));
            setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, target } : d));
        };
        const up = (): void => {
            const d = drag();
            if (d?.target) {
                commit(applyDrop(editor.artifact, d.target, d.payload));
                setSelection({ kind: "cell", section: d.target.section, cell: d.target.cell });
                setHover(null);
            }
            setDrag(null);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        onCleanup(() => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        });
    });

    return (
        <main
            ref={scrollEl}
            class="overflow-y-auto px-10 pt-8 pb-[140px]"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDblClick={onDoubleClick}
            onPointerLeave={() => !drag() && setHover(null)}
        >
            <div ref={stageEl} class="relative mx-auto max-w-[1100px]">
                <div ref={paintHost} class="absolute inset-0" />
                <Overlay />
                <DropIndicator />
                <TextEditor />
            </div>
        </main>
    );
};
