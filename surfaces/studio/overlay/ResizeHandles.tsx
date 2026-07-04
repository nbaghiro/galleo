import type { ElementLayout } from "@model/artifact";
import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import { GUTTER } from "@elements/compose";
import { getElementAt } from "@elements/ops";
import { getElement } from "@elements/registry";
import { cellRegionId, elementRegionId, parentTarget, regionId } from "@model/target";
import { applyLiveEdit, liveEdit, setLiveEdit } from "../editing/manipulate";
import { commit, editor, editorAccent, regions, selection, stageEl } from "../editor";

// The selection border IS the resize affordance — a thin drag zone along each edge (right = width,
// bottom = height/aspect, corner = both), highlighted on hover. An edge only appears when resizing that
// direction is feasible: width needs horizontal slack (or an explicit %); height needs a declared
// height/aspect field. So a full-width, auto-height element shows no resize edges at all.
type Axis = "w" | "h" | "wh";
type Edge = "right" | "bottom" | "corner";

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const EDGE = 8; // draggable border thickness

export const ResizeHandles: Component = () => {
    const ctx = createMemo(() => {
        const sel = selection();
        if (sel?.kind !== "element") return null;
        const inst = getElementAt(editor.artifact, sel.address);
        const spec = inst ? getElement(inst.type) : undefined;
        if (!inst || !spec) return null;
        const box = regions().find((r) => r.id === elementRegionId(sel.address))?.box;
        if (!box) return null;
        // Content width available to the element: a top-level element sits in its cell (fixed gutter);
        // a nested one uses its parent container box.
        const topLevel = sel.address.path.length === 0;
        const parent = topLevel ? null : parentTarget(sel);
        const parentBox = topLevel
            ? regions().find((r) => r.id === cellRegionId(sel.address.section, sel.address.cell))
                  ?.box
            : parent
              ? regions().find((r) => r.id === regionId(parent))?.box
              : undefined;
        const contentW = parentBox ? (topLevel ? parentBox.w - 2 * GUTTER : parentBox.w) : box.w;
        // Width is feasible only with real slack (element narrower than its content width) or when it is
        // already an explicit %, so a full-width fill/auto element offers no width edge.
        const isPct = typeof inst.layout?.width === "object";
        const canW = spec.resize?.width !== false && (isPct || box.w < contentW - 6);
        const hCfg = spec.resize?.height;
        const aCfg = spec.resize?.aspect;
        return { address: sel.address, box, contentW, canW, hCfg, aCfg, canH: !!hCfg || !!aCfg };
    });

    const zones = createMemo(() => {
        const c = ctx();
        if (!c) return [];
        const b = c.box;
        const out: { axis: Axis; edge: Edge; x: number; y: number; w: number; h: number }[] = [];
        if (c.canW)
            out.push({
                axis: "w",
                edge: "right",
                x: b.x + b.w - EDGE / 2,
                y: b.y,
                w: EDGE,
                h: b.h,
            });
        if (c.canH)
            out.push({
                axis: "h",
                edge: "bottom",
                x: b.x,
                y: b.y + b.h - EDGE / 2,
                w: b.w,
                h: EDGE,
            });
        if (c.canW && c.canH)
            out.push({
                axis: "wh",
                edge: "corner",
                x: b.x + b.w - EDGE,
                y: b.y + b.h - EDGE,
                w: EDGE * 1.75,
                h: EDGE * 1.75,
            });
        return out;
    });

    const cursorFor = (edge: Edge): string =>
        edge === "right" ? "ew-resize" : edge === "bottom" ? "ns-resize" : "nwse-resize";

    const onDown = (e: PointerEvent, axis: Axis): void => {
        e.preventDefault();
        e.stopPropagation();
        const c = ctx();
        const stage = stageEl();
        if (!c || !stage) return;
        const rect = stage.getBoundingClientRect();
        const start = c.box;
        const move = (ev: PointerEvent): void => {
            const px = ev.clientX - rect.left;
            const py = ev.clientY - rect.top;
            const layoutPatch: Partial<ElementLayout> = {};
            const dataPatch: Record<string, unknown> = {};
            if ((axis === "w" || axis === "wh") && c.canW) {
                const w = Math.max(20, px - start.x);
                layoutPatch.width = {
                    pct: Math.round(clamp((w / c.contentW) * 100, 10, 100) / 5) * 5,
                };
            }
            if ((axis === "h" || axis === "wh") && c.canH) {
                const h = Math.max(8, py - start.y);
                if (c.hCfg) {
                    const step = c.hCfg.step ?? 1;
                    dataPatch[c.hCfg.key] =
                        Math.round(clamp(h, c.hCfg.min, c.hCfg.max) / step) * step;
                } else if (c.aCfg) {
                    dataPatch.aspect =
                        Math.round(clamp(start.w / h, c.aCfg.min, c.aCfg.max) * 100) / 100;
                }
            }
            setLiveEdit({
                kind: "element",
                address: c.address,
                layoutPatch: Object.keys(layoutPatch).length ? layoutPatch : undefined,
                dataPatch: Object.keys(dataPatch).length ? dataPatch : undefined,
            });
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

    // The accent emphasis drawn on the hovered edge (the border itself lighting up).
    const barClass = (edge: Edge): string =>
        edge === "right"
            ? "absolute right-0 top-0 h-full w-[3px] rounded-full"
            : edge === "bottom"
              ? "absolute bottom-0 left-0 h-[3px] w-full rounded-full"
              : "absolute bottom-0 right-0 h-2 w-2 rounded-[3px]";

    return (
        <Show when={ctx()}>
            <For each={zones()}>
                {(z) => (
                    <div
                        class="group absolute z-20"
                        style={{
                            left: `${z.x}px`,
                            top: `${z.y}px`,
                            width: `${z.w}px`,
                            height: `${z.h}px`,
                            cursor: cursorFor(z.edge),
                            "touch-action": "none",
                        }}
                        onPointerDown={(e) => onDown(e, z.axis)}
                    >
                        <div
                            class={`${barClass(z.edge)} opacity-0 transition-opacity group-hover:opacity-100`}
                            style={{ background: editorAccent() }}
                        />
                    </div>
                )}
            </For>
        </Show>
    );
};
