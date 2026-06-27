import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { sectionRegionId } from "@model/address";
import { addSectionAfter, duplicateSectionAt, moveSectionBy, regions, removeSectionAt, selection } from "./editor";

const btn = "flex h-7 w-7 items-center justify-center rounded-md text-[13px] leading-none text-ink hover:bg-canvas";

// Floating toolbar over a selected section: reorder · duplicate · add-below · delete.
export const SectionToolbar: Component = () => {
    const sid = createMemo(() => {
        const s = selection();
        return s?.kind === "section" ? s.section : null;
    });
    const box = createMemo(() => {
        const id = sid();
        return id ? (regions().find((r) => r.id === sectionRegionId(id))?.box ?? null) : null;
    });

    return (
        <Show when={box()}>
            {(b) => (
                <div
                    class="absolute z-20 flex items-center gap-0.5 rounded-lg border border-line bg-panel p-1 shadow-lg"
                    style={{ left: `${b().x + b().w - 184}px`, top: `${b().y + 10}px` }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <button class={btn} title="Move up" onClick={() => moveSectionBy(sid()!, -1)}>↑</button>
                    <button class={btn} title="Move down" onClick={() => moveSectionBy(sid()!, 1)}>↓</button>
                    <button class={btn} title="Duplicate" onClick={() => duplicateSectionAt(sid()!)}>⧉</button>
                    <button class={btn} title="Add section below" onClick={() => addSectionAfter(sid()!)}>＋</button>
                    <button class={`${btn} text-accent`} title="Delete section" onClick={() => removeSectionAt(sid()!)}>✕</button>
                </div>
            )}
        </Show>
    );
};
