import type { Rect } from "@engine/node";
import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { elementRegionId } from "@model/address";
import { ElementInspector } from "./ElementInspector";
import { regions, selection, stageEl } from "../editor";

const PW = 290; // popover width
const GAP = 14;

// The element inspector as a floating popover anchored to the selected element (instead of the
// far-right panel). Lives in the canvas stage, so it tracks the element and scrolls with it. Placed
// to the element's side when there's room, otherwise below it — so it never buries a full-width block.
export const ElementOverlay: Component = () => {
    const addr = createMemo(() => {
        const s = selection();
        return s?.kind === "element" ? s.address : null;
    });
    const box = createMemo((): Rect | null => {
        const a = addr();
        if (!a) return null;
        return regions().find((r) => r.id === elementRegionId(a))?.box ?? null;
    });
    const pos = createMemo((): { left: number; top: number } | null => {
        const b = box();
        if (!b) return null;
        const w = stageEl()?.clientWidth ?? 960;
        if (b.x + b.w + GAP + PW <= w) return { left: b.x + b.w + GAP, top: Math.max(b.y, 0) };
        if (b.x - GAP - PW >= 0) return { left: b.x - GAP - PW, top: Math.max(b.y, 0) };
        return { left: Math.min(Math.max(b.x, 0), w - PW), top: b.y + b.h + 12 };
    });

    return (
        <Show when={pos()}>
            {(p) => (
                <div
                    class="absolute z-30 max-h-[64vh] w-[290px] overflow-y-auto rounded-2xl border border-line bg-panel/95 p-[18px] shadow-2xl backdrop-blur-md"
                    style={{ left: `${p().left}px`, top: `${p().top}px` }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <ElementInspector address={addr()!} />
                </div>
            )}
        </Show>
    );
};
