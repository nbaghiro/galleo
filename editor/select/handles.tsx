// Direct-manipulation drag handles: resize, spacing/padding, and column-divider handles on the selected node.

import type { ElementLayout } from "@model/geometry";
import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import { GUTTER } from "@elements/compose";
import { getElementAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { cellRegionId, elementRegionId, parentTarget, regionId } from "@model/target";
import { applyLiveEdit, liveEdit, setLiveEdit } from "../editing/manipulate";
import { commit, editor, editorAccent, regions, selection, stageEl } from "../editor";
import type { Rect } from "@engine/node";
import { fallbackTemplate, TEMPLATES } from "@elements/compose";

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

// Container spacing handles (canvas coords) for a selected group/card: a grip in each gap between
// children (drag along the flow → gap), and a corner grip at the content inset (drag → padding). Both
// live-preview through the shared liveEdit signal, committing on release.

export const SpacingHandles: Component = () => {
    const ctx = createMemo(() => {
        const sel = selection();
        if (sel?.kind !== "element") return null;
        const inst = getElementAt(editor.artifact, sel.address);
        const spec = inst ? getElement(inst.type) : undefined;
        if (!inst || !spec?.spacing) return null;
        const kids: Rect[] = [];
        for (let i = 0; ; i++) {
            const box = regions().find(
                (r) => r.id === elementRegionId({ ...sel.address, path: [...sel.address.path, i] }),
            )?.box;
            if (!box) break;
            kids.push(box);
        }
        return {
            address: sel.address,
            kids,
            data: inst.data as Record<string, unknown>,
            spacing: spec.spacing,
        };
    });

    // A gap grip at each boundary between consecutive children (along the container's inferred axis).
    const gaps = createMemo(() => {
        const c = ctx();
        if (!c?.spacing.gap || c.kids.length < 2) return [];
        const xs = c.kids.map((k) => k.x);
        const ys = c.kids.map((k) => k.y);
        const row = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
        const sorted = [...c.kids].sort((a, b) => (row ? a.x - b.x : a.y - b.y));
        const out: { x: number; y: number; row: boolean }[] = [];
        for (let i = 0; i < sorted.length - 1; i++) {
            const a = sorted[i]!;
            const b = sorted[i + 1]!;
            out.push(
                row
                    ? { x: (a.x + a.w + b.x) / 2, y: a.y + a.h / 2, row: true }
                    : { x: a.x + a.w / 2, y: (a.y + a.h + b.y) / 2, row: false },
            );
        }
        return out;
    });

    // The content-inset grip at the top-left child corner.
    const pad = createMemo(() => {
        const c = ctx();
        if (!c?.spacing.padding || c.kids.length === 0) return null;
        const first = c.kids.reduce(
            (m, k) => (k.y < m.y || (k.y === m.y && k.x < m.x) ? k : m),
            c.kids[0]!,
        );
        return { x: first.x, y: first.y };
    });

    const begin = (
        e: PointerEvent,
        cfg: { key: string; min: number; max: number; def: number },
        mode: "row" | "col" | "both",
    ): void => {
        e.preventDefault();
        e.stopPropagation();
        const c = ctx();
        if (!c) return;
        const start = Number(c.data[cfg.key] ?? cfg.def);
        const sx = e.clientX;
        const sy = e.clientY;
        const move = (ev: PointerEvent): void => {
            const dx = ev.clientX - sx;
            const dy = ev.clientY - sy;
            const delta = mode === "row" ? dx : mode === "col" ? dy : (dx + dy) / 2;
            const val = Math.round(clamp(start + delta, cfg.min, cfg.max));
            setLiveEdit({ kind: "element", address: c.address, dataPatch: { [cfg.key]: val } });
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
            {(c) => (
                <>
                    <For each={gaps()}>
                        {(g) => (
                            <div
                                class="absolute z-20 rounded-full opacity-70 hover:opacity-100"
                                style={{
                                    left: `${g.x}px`,
                                    top: `${g.y}px`,
                                    width: g.row ? "4px" : "18px",
                                    height: g.row ? "18px" : "4px",
                                    transform: "translate(-50%, -50%)",
                                    background: editorAccent(),
                                    cursor: g.row ? "ew-resize" : "ns-resize",
                                    "touch-action": "none",
                                }}
                                onPointerDown={(e) =>
                                    begin(e, c().spacing.gap!, g.row ? "row" : "col")
                                }
                            />
                        )}
                    </For>
                    <Show when={pad()}>
                        {(p) => (
                            <div
                                class="absolute z-20 h-2.5 w-2.5 rounded-[2px] border-2 bg-panel"
                                style={{
                                    left: `${p().x}px`,
                                    top: `${p().y}px`,
                                    transform: "translate(-50%, -50%)",
                                    "border-color": editorAccent(),
                                    cursor: "nwse-resize",
                                    "touch-action": "none",
                                }}
                                onPointerDown={(e) => begin(e, c().spacing.padding!, "both")}
                            />
                        )}
                    </Show>
                </>
            )}
        </Show>
    );
};

// Draggable dividers between a section's columns (canvas coords). Shown when the section or one of its
// cells is selected; dragging reallocates the two adjacent column fractions (their combined width is
// preserved). Live-previews via the shared liveEdit signal, committing on release.
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
