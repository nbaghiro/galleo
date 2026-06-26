import type { Component } from "solid-js";
import { createEffect, onCleanup, onMount } from "solid-js";
import { paint } from "./dom-backend";
import { editor, setCanvasEl, setEditor } from "./editor";
import { measureText } from "./measure";
import { SECTION_GAP, layoutSection } from "./render";

// The continuous section canvas. Each section is laid out at the canvas width by the engine and
// painted into its own absolutely-positioned layer. Re-runs when the artifact changes or on resize.
export const Canvas: Component = () => {
    let scrollEl!: HTMLElement;
    let stageEl!: HTMLDivElement;

    const draw = (): void => {
        if (!stageEl) return;
        const width = stageEl.clientWidth || 800;
        stageEl.replaceChildren();
        stageEl.style.position = "relative";

        let y = 0;
        const tops: number[] = [];
        for (const section of editor.artifact.sections) {
            const { commands, height } = layoutSection(section, width, measureText);
            const layer = document.createElement("div");
            layer.style.cssText = `left:0;top:${y}px;width:${width}px;height:${height}px`;
            paint(commands, layer);
            // paint() forces position:relative on its host; keep the layer absolute (out of flow)
            // so it sits exactly at top:y — otherwise normal-flow + top stacks and gaps compound.
            layer.style.position = "absolute";
            stageEl.appendChild(layer);
            tops.push(y);
            y += height + SECTION_GAP;
        }
        stageEl.style.height = `${y}px`;
        setEditor("sectionTops", tops);
    };

    onMount(() => {
        setCanvasEl(scrollEl);
        const ro = new ResizeObserver(() => draw());
        ro.observe(scrollEl);
        onCleanup(() => ro.disconnect());
    });

    // Reads editor.artifact.sections inside draw(), so it re-runs on content edits.
    createEffect(() => draw());

    return (
        <main ref={scrollEl} class="overflow-y-auto px-10 pt-8 pb-[140px]">
            <div ref={stageEl} class="relative mx-auto max-w-[1100px]" />
        </main>
    );
};
