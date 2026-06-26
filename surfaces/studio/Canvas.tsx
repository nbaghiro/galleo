import type { Region } from "@engine/render-command";
import type { Target } from "@model/address";
import type { Component } from "solid-js";
import { createEffect, onCleanup, onMount } from "solid-js";
import { parentTarget, parseTarget, specificity } from "@model/address";
import { paint } from "./dom-backend";
import { editor, setCanvasEl, setEditor, setHover, setRegions, setSelection } from "./editor";
import { measureText } from "./measure";
import { Overlay } from "./Overlay";
import { SECTION_GAP, layoutSection } from "./render";

// The continuous section canvas: the engine lays out each section at the canvas width; sections are
// painted into a host layer-by-layer and their regions accumulated (offset to canvas coords) for
// hit-testing. The overlay sits above the paint host and tracks selection/hover.
export const Canvas: Component = () => {
    let scrollEl!: HTMLElement;
    let stageEl!: HTMLDivElement;
    let paintHost!: HTMLDivElement;

    let liveRegions: Region[] = [];

    const draw = (): void => {
        if (!paintHost) return;
        const width = stageEl.clientWidth || 800;
        paintHost.replaceChildren();

        let y = 0;
        const tops: number[] = [];
        const all: Region[] = [];
        for (const section of editor.artifact.sections) {
            const { commands, regions, height } = layoutSection(section, width, measureText);
            const layer = document.createElement("div");
            layer.style.cssText = `left:0;top:${y}px;width:${width}px;height:${height}px`;
            paint(commands, layer);
            // paint() forces position:relative; keep the layer absolute so it sits exactly at top:y.
            layer.style.position = "absolute";
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

    const hitTest = (px: number, py: number): Target | null => {
        let best: Target | null = null;
        let bestSpec = -1;
        for (const r of liveRegions) {
            const b = r.box;
            if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) continue;
            const t = parseTarget(r.id);
            if (!t) continue;
            const s = specificity(t);
            if (s > bestSpec) {
                bestSpec = s;
                best = t;
            }
        }
        return best;
    };

    const pointInStage = (e: { clientX: number; clientY: number }): [number, number] => {
        const rect = stageEl.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    };

    onMount(() => {
        setCanvasEl(scrollEl);
        const ro = new ResizeObserver(() => draw());
        ro.observe(scrollEl);
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") setSelection((cur) => (cur ? parentTarget(cur) : null));
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => {
            ro.disconnect();
            window.removeEventListener("keydown", onKey);
        });
    });

    // Reads editor.artifact.sections inside draw(), so it re-runs on content edits.
    createEffect(() => draw());

    return (
        <main
            ref={scrollEl}
            class="overflow-y-auto px-10 pt-8 pb-[140px]"
            onClick={(e) => setSelection(hitTest(...pointInStage(e)))}
            onPointerMove={(e) => setHover(hitTest(...pointInStage(e)))}
            onPointerLeave={() => setHover(null)}
        >
            <div ref={stageEl} class="relative mx-auto max-w-[1100px]">
                <div ref={paintHost} class="absolute inset-0" />
                <Overlay />
            </div>
        </main>
    );
};
