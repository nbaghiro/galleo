import type { Rect } from "@engine/node";
import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import { getElementAt } from "@elements/ops";
import { getElement } from "@elements/registry";
import { elementRegionId } from "@model/address";
import { applyLiveEdit, liveEdit, setLiveEdit } from "../editing/manipulate";
import { commit, editor, editorAccent, regions, selection } from "../editor";

// Container spacing handles (canvas coords) for a selected group/card: a grip in each gap between
// children (drag along the flow → gap), and a corner grip at the content inset (drag → padding). Both
// live-preview through the shared liveEdit signal, committing on release.
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

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
