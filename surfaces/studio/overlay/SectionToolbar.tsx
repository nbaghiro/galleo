import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { sectionRegionId } from "@model/address";
import {
    addSectionAfter,
    duplicateSectionAt,
    moveSectionBy,
    regions,
    removeSectionAt,
    selection,
} from "../editor";
import { Icon } from "../icons";

const btn =
    "flex h-7 w-7 items-center justify-center rounded-md text-[13px] leading-none text-ink hover:bg-canvas";

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
                    style={{ left: `${b().x + 10}px`, top: `${b().y + 10}px` }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <button class={btn} title="Move up" onClick={() => moveSectionBy(sid()!, -1)}>
                        <Icon name="chevronUp" size={15} />
                    </button>
                    <button class={btn} title="Move down" onClick={() => moveSectionBy(sid()!, 1)}>
                        <Icon name="chevronDown" size={15} />
                    </button>
                    <button
                        class={btn}
                        title="Duplicate"
                        onClick={() => duplicateSectionAt(sid()!)}
                    >
                        <Icon name="duplicate" size={14} />
                    </button>
                    <button
                        class={btn}
                        title="Add section below"
                        onClick={() => addSectionAfter(sid()!)}
                    >
                        <Icon name="plus" size={15} />
                    </button>
                    <button
                        class={`${btn} text-accent`}
                        title="Delete section"
                        onClick={() => removeSectionAt(sid()!)}
                    >
                        <Icon name="close" size={14} />
                    </button>
                </div>
            )}
        </Show>
    );
};
