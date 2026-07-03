import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { drag } from "../editing/dnd";
import { editorAccent } from "../editor";

// Lives inside the canvas stage (canvas coords). For a "between" drop (hovering an existing element) it
// draws a thin accent insertion line at the target boundary. For a "reflow" drop (open space) it shows
// nothing here — the ghost skeleton is painted inline in the preview artifact, which auto-sizes the
// section around it.
export const DropIndicator: Component = () => {
    const line = createMemo(() => {
        const t = drag()?.target;
        return t && !t.reflow ? t.slot : null;
    });

    return (
        <Show when={line()}>
            {(b) => (
                <div
                    class="pointer-events-none absolute rounded-full"
                    style={{
                        left: `${b().x}px`,
                        top: `${b().y}px`,
                        width: `${b().w}px`,
                        height: `${b().h}px`,
                        background: editorAccent(),
                    }}
                />
            )}
        </Show>
    );
};
