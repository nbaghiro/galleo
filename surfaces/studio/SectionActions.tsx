import type { Target } from "@model/address";
import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { sectionRegionId } from "@model/address";
import { addSectionAfter, hover, regions, setAgentOpen, setSelection } from "./editor";

function sectionOf(t: Target | null): string | null {
    if (!t) return null;
    if (t.kind === "element") return t.address.section;
    return t.section;
}

const action = "rounded-full px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-canvas";

// On section hover, a pill bar straddles the section's bottom edge: add a section below, generate, or
// jump to the section's layout/background controls.
export const SectionActions: Component = () => {
    const sid = createMemo(() => sectionOf(hover()));
    const box = createMemo(() => {
        const id = sid();
        return id ? (regions().find((r) => r.id === sectionRegionId(id))?.box ?? null) : null;
    });

    return (
        <Show when={box()}>
            {(b) => (
                <div
                    class="absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-line bg-panel/95 px-1.5 py-1 shadow-lg backdrop-blur-md"
                    style={{ left: `${b().x + b().w / 2}px`, top: `${b().y + b().h - 16}px` }}
                    onPointerMove={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <button class={action} title="Add a section below" onClick={() => addSectionAfter(sid()!)}>
                        ＋ Section
                    </button>
                    <span class="h-3.5 w-px bg-line" />
                    <button class={action} title="Generate with the agent" onClick={() => setAgentOpen(true)}>
                        ✦ Generate
                    </button>
                    <span class="h-3.5 w-px bg-line" />
                    <button class={action} title="Section layout & background" onClick={() => setSelection({ kind: "section", section: sid()! })}>
                        ⊞ Layout
                    </button>
                </div>
            )}
        </Show>
    );
};
