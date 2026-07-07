// Direct-manipulation drag handles: element height/aspect resize, container spacing, and the in-between
// region dividers that resize side-by-side regions (cells + row-arranged element siblings, any depth).

import type { ElementLayout } from "@model/geometry";
import type { ElementAddress } from "@model/target";
import type { ArtifactContent } from "@model/artifact";
import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { getElementAt, setElementLayout, setSectionWidths, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { cellRegionId, elementRegionId } from "@model/target";
import { commit, editor, editorAccent, hover, regions, selection, stageEl } from "../editor";
import type { Rect, Region } from "@engine/node";
import { fallbackTemplate, TEMPLATES } from "@elements/compose";

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const EDGE = 8; // draggable border thickness

// Height / aspect resize on the SELECTED element's bottom edge only. Width + corner handles were removed:
// they overlapped neighbouring elements' own affordances, and width is now sized via the in-between
// RegionDividers instead. An element only shows this edge when it declares a height or aspect field.
export const ResizeHandles: Component = () => {
    const ctx = createMemo(() => {
        const sel = selection();
        if (sel?.kind !== "element") return null;
        const inst = getElementAt(editor.artifact, sel.address);
        const spec = inst ? getElement(inst.type) : undefined;
        if (!inst || !spec) return null;
        const hCfg = spec.resize?.height;
        const aCfg = spec.resize?.aspect;
        if (!hCfg && !aCfg) return null;
        const box = regions().find((r) => r.id === elementRegionId(sel.address))?.box;
        if (!box) return null;
        return { address: sel.address, box, hCfg, aCfg };
    });

    const onDown = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        const c = ctx();
        const stage = stageEl();
        if (!c || !stage) return;
        const rect = stage.getBoundingClientRect();
        const start = c.box;
        const move = (ev: PointerEvent): void => {
            const h = Math.max(8, ev.clientY - rect.top - start.y);
            const dataPatch: Record<string, unknown> = {};
            if (c.hCfg) {
                const step = c.hCfg.step ?? 1;
                dataPatch[c.hCfg.key] = Math.round(clamp(h, c.hCfg.min, c.hCfg.max) / step) * step;
            } else if (c.aCfg) {
                dataPatch.aspect =
                    Math.round(clamp(start.w / h, c.aCfg.min, c.aCfg.max) * 100) / 100;
            }
            setLiveEdit({ kind: "element", address: c.address, dataPatch });
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
                <div
                    class="group absolute z-20"
                    style={{
                        left: `${c().box.x}px`,
                        top: `${c().box.y + c().box.h - EDGE / 2}px`,
                        width: `${c().box.w}px`,
                        height: `${EDGE}px`,
                        cursor: "ns-resize",
                        "touch-action": "none",
                    }}
                    onPointerDown={onDown}
                >
                    <div
                        class="absolute bottom-0 left-0 h-[3px] w-full rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ background: editorAccent() }}
                    />
                </div>
            )}
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

// In-between region dividers — the primary resize affordance. A draggable bar sits between two
// horizontally-adjacent regions and reallocates their combined width on drag. Covered regions: a
// section's grid cells (→ section.widths) AND the row-arranged children of ANY container at any nesting
// depth (→ each child's ElementLayout.width %). Revealed while the region's section is hovered (so they
// never overlap an element's own selection affordances), fading in on hover of the individual divider.
const round = (n: number): number => Math.round(n * 1000) / 1000;

interface Divider {
    key: string;
    x: number; // centre, canvas coords
    top: number;
    h: number;
    apply: (stageX: number) => LiveEdit; // stageX = clientX − stage.left
}

function cellDividers(sid: string, grid: string, regs: Region[]): Divider[] {
    const tmpl = TEMPLATES[grid] ?? fallbackTemplate;
    if (tmpl.cells.length < 2) return [];
    const boxes = tmpl.cells.map((k) => regs.find((r) => r.id === cellRegionId(sid, k))?.box);
    if (boxes.some((b) => !b)) return [];
    const b = boxes as Rect[];
    const rowLeft = b[0]!.x;
    const rowWidth = b[b.length - 1]!.x + b[b.length - 1]!.w - rowLeft;
    const fractions = b.map((x) => x.w / rowWidth);
    const top = Math.min(...b.map((x) => x.y));
    const h = Math.max(...b.map((x) => x.y + x.h)) - top;
    const out: Divider[] = [];
    for (let i = 0; i < b.length - 1; i++) {
        const before = fractions.slice(0, i).reduce((a, x) => a + x, 0);
        const combined = fractions[i]! + fractions[i + 1]!;
        out.push({
            key: `cell:${sid}:${i}`,
            x: (b[i]!.x + b[i]!.w + b[i + 1]!.x) / 2,
            top,
            h,
            apply: (stageX) => {
                const fi = clamp((stageX - rowLeft) / rowWidth - before, 0.12, combined - 0.12);
                const widths = [...fractions];
                widths[i] = round(fi);
                widths[i + 1] = round(combined - fi);
                return { kind: "columns", section: sid, widths };
            },
        });
    }
    return out;
}

function siblingDividers(sid: string, regs: Region[]): Divider[] {
    // Group every element region in the section by its parent (cell + parent path) → its sibling set.
    const groups = new Map<
        string,
        { cell: string; parentPath: number[]; members: { index: number; box: Rect }[] }
    >();
    for (const r of regs) {
        if (!r.id.startsWith(`el:${sid}:`)) continue;
        const parts = r.id.split(":");
        const cell = parts[2]!;
        const pathStr = parts[3] ?? "";
        if (pathStr === "") continue; // the cell's root element has no in-cell sibling boundary
        const path = pathStr.split(".").map(Number);
        const key = `${cell}|${path.slice(0, -1).join(".")}`;
        let g = groups.get(key);
        if (!g) {
            g = { cell, parentPath: path.slice(0, -1), members: [] };
            groups.set(key, g);
        }
        g.members.push({ index: path[path.length - 1]!, box: r.box });
    }
    const out: Divider[] = [];
    for (const g of groups.values()) {
        if (g.members.length < 2) continue;
        // Width can only be reallocated between siblings sitting side by side in one row. Skip any set
        // whose members don't share a common horizontal band — a column-stacked set, or a grid (e.g. a
        // table) whose rows sit fully below one another. Purely geometric, so it stays element-agnostic.
        const tops = g.members.map((m) => m.box.y);
        const bottoms = g.members.map((m) => m.box.y + m.box.h);
        if (Math.max(...tops) >= Math.min(...bottoms)) continue;
        const sorted = [...g.members].sort((a, b) => a.box.x - b.box.x);
        const rowLeft = sorted[0]!.box.x;
        const last = sorted[sorted.length - 1]!.box;
        const rowWidth = last.x + last.w - rowLeft;
        if (rowWidth <= 0) continue;
        const fractions = sorted.map((m) => m.box.w / rowWidth);
        const top = Math.min(...tops);
        const h = Math.max(...bottoms) - top;
        for (let i = 0; i < sorted.length - 1; i++) {
            const before = fractions.slice(0, i).reduce((a, x) => a + x, 0);
            const combined = fractions[i]! + fractions[i + 1]!;
            const idxL = sorted[i]!.index;
            const idxR = sorted[i + 1]!.index;
            const parent: ElementAddress = { section: sid, cell: g.cell, path: g.parentPath };
            out.push({
                key: `el:${sid}:${g.cell}:${g.parentPath.join(".")}:${i}`,
                x: (sorted[i]!.box.x + sorted[i]!.box.w + sorted[i + 1]!.box.x) / 2,
                top,
                h,
                apply: (stageX) => {
                    const fi = clamp((stageX - rowLeft) / rowWidth - before, 0.1, combined - 0.1);
                    return {
                        kind: "siblings",
                        parent,
                        entries: [
                            { index: idxL, pct: Math.round(fi * 100) },
                            { index: idxR, pct: Math.round((combined - fi) * 100) },
                        ],
                    };
                },
            });
        }
    }
    return out;
}

export const RegionDividers: Component = () => {
    // The section whose dividers are shown: the hovered one, else the selected one.
    const sid = createMemo<string | null>(() => {
        const t = hover() ?? selection();
        if (!t) return null;
        return t.kind === "element" ? t.address.section : t.section;
    });

    const dividers = createMemo((): Divider[] => {
        const id = sid();
        if (!id) return [];
        const section = editor.artifact.sections.find((s) => s.id === id);
        if (!section) return [];
        const regs = regions();
        return [...cellDividers(id, section.grid, regs), ...siblingDividers(id, regs)];
    });

    const onDown = (e: PointerEvent, d: Divider): void => {
        e.preventDefault();
        e.stopPropagation();
        const stage = stageEl();
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const move = (ev: PointerEvent): void => {
            setLiveEdit(d.apply(ev.clientX - rect.left));
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
                    onPointerDown={(e) => onDown(e, d)}
                >
                    <div
                        class="h-full w-[2px] rounded-full opacity-25 transition-opacity duration-150 group-hover:opacity-100"
                        style={{ background: editorAccent() }}
                    />
                </div>
            )}
        </For>
    );
};

// A live, uncommitted direct-manipulation edit driven by a canvas handle. The canvas paints
// `applyLiveEdit(artifact, edit)` while a handle is dragged so the layout reflows in real time; the same
// op is committed on release. One signal covers every handle kind.
export type LiveEdit =
    | {
          kind: "element";
          address: ElementAddress;
          layoutPatch?: Partial<ElementLayout>; // cross-axis (ElementLayout)
          dataPatch?: Record<string, unknown>; // height / aspect / gap / padding (element data)
      }
    | { kind: "columns"; section: string; widths: number[] }
    | { kind: "siblings"; parent: ElementAddress; entries: { index: number; pct: number }[] };

export const [liveEdit, setLiveEdit] = createSignal<LiveEdit | null>(null);

export function applyLiveEdit(art: ArtifactContent, edit: LiveEdit): ArtifactContent {
    if (edit.kind === "columns") return setSectionWidths(art, edit.section, edit.widths);
    if (edit.kind === "siblings") {
        let out = art;
        for (const e of edit.entries) {
            const addr: ElementAddress = {
                section: edit.parent.section,
                cell: edit.parent.cell,
                path: [...edit.parent.path, e.index],
            };
            const inst = getElementAt(out, addr);
            if (inst)
                out = setElementLayout(out, addr, {
                    ...(inst.layout ?? {}),
                    width: { pct: e.pct },
                });
        }
        return out;
    }
    const inst = getElementAt(art, edit.address);
    if (!inst) return art;
    let out = art;
    if (edit.layoutPatch)
        out = setElementLayout(out, edit.address, { ...(inst.layout ?? {}), ...edit.layoutPatch });
    if (edit.dataPatch)
        out = updateDataAt(out, edit.address, {
            ...(inst.data as Record<string, unknown>),
            ...edit.dataPatch,
        });
    return out;
}
