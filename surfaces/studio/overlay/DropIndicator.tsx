import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { cellRegionId } from "@model/address";
import { drag } from "../editing/dnd";
import { editorAccent, regions } from "../editor";

// Lives inside the canvas stage (canvas coords): an accent ring on an empty target cell, or an accent
// insertion line between items. Shows where the dragged element will land.
export const DropIndicator: Component = () => {
    const cellBox = createMemo(() => {
        const t = drag()?.target;
        if (!t) return null;
        return regions().find((r) => r.id === cellRegionId(t.section, t.cell))?.box ?? null;
    });

    return (
        <>
            <Show when={drag()?.target?.mode === "place" && cellBox()}>
                {(b) => (
                    <div
                        class="pointer-events-none absolute rounded-[10px]"
                        style={{
                            left: `${b().x}px`,
                            top: `${b().y}px`,
                            width: `${b().w}px`,
                            height: `${b().h}px`,
                            "box-shadow": `0 0 0 2px ${editorAccent()}`,
                        }}
                    />
                )}
            </Show>
            <Show when={drag()?.target?.mode === "insert" && cellBox()}>
                {(b) => (
                    <div
                        class="pointer-events-none absolute rounded-full"
                        style={{
                            left: `${b().x + 10}px`,
                            top: `${drag()?.target?.indicatorY ?? 0}px`,
                            width: `${b().w - 20}px`,
                            height: "3px",
                            background: editorAccent(),
                        }}
                    />
                )}
            </Show>
        </>
    );
};
