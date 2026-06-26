import type { Component } from "solid-js";
import { createMemo, For } from "solid-js";
import { setSectionGrid } from "@elements/ops";
import { TEMPLATE_LABELS, TEMPLATES } from "@elements/templates";
import { commit, editor } from "./editor";

const ids = Object.keys(TEMPLATES);

// Section layout picker: swap the section's grid template (existing cell content is preserved).
export const SectionInspector: Component<{ section: string }> = (props) => {
    const grid = createMemo(() => editor.artifact.sections.find((s) => s.id === props.section)?.grid);

    return (
        <div>
            <div class="mb-4 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">Section layout</div>
            <div class="grid grid-cols-2 gap-2">
                <For each={ids}>
                    {(id) => (
                        <button
                            onClick={() => commit(setSectionGrid(editor.artifact, props.section, id))}
                            class={`flex flex-col items-stretch gap-1.5 rounded-lg border p-2 ${grid() === id ? "border-accent bg-[#faf2e9]" : "border-line bg-white"}`}
                        >
                            <div class="flex h-7 gap-1">
                                <For each={TEMPLATES[id]!.widths}>
                                    {(w) => <div class="rounded-sm bg-[#e3ddce]" style={{ "flex-grow": w.mode === "percent" ? String(w.value) : "1" }} />}
                                </For>
                            </div>
                            <span class="text-[11px] font-semibold text-ink">{TEMPLATE_LABELS[id] ?? id}</span>
                        </button>
                    )}
                </For>
            </div>
        </div>
    );
};
