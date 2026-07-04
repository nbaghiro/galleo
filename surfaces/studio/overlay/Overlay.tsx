import type { Region } from "@engine/node";
import type { Target } from "@model/target";
import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { regionId } from "@model/target";
import { editor, editorAccent, hover, regions, selection } from "../editor";

// Fallback radius for nodes that paint no corner of their own (text, groups): square in the seamless
// doc/web formats (rounded looks odd on square sections), a small round on paged decks.
const fallbackRadius = (): number =>
    resolveProfile(editor.artifact.format).kind === "continuous" ? 0 : 7;

// Selection + hover highlights, drawn as box-shadow rings (no layout impact) over the painted canvas.
// Reads geometry from the engine-reported regions, so it tracks exactly what the engine laid out — and
// each region carries the corner radius it actually painted, so the outline hugs the element/section
// (image, card, themed section) with no gap, matching whatever radius the element / theme sets.

function regionFor(t: Target | null): Region | null {
    if (!t) return null;
    const id = regionId(t);
    return regions().find((r) => r.id === id) ?? null;
}

const ring = (r: Region, shadow: string) => ({
    left: `${r.box.x}px`,
    top: `${r.box.y}px`,
    width: `${r.box.w}px`,
    height: `${r.box.h}px`,
    "border-radius": `${r.radius ?? fallbackRadius()}px`,
    "box-shadow": shadow,
});

export const Overlay: Component = () => {
    const sel = createMemo(() => regionFor(selection()));
    const hov = createMemo(() => {
        const h = hover();
        if (!h) return null;
        const s = selection();
        if (s && regionId(s) === regionId(h)) return null;
        return regionFor(h);
    });
    return (
        <>
            <Show when={hov()}>
                {(r) => (
                    <div
                        class="pointer-events-none absolute opacity-50"
                        style={ring(r(), `0 0 0 1.5px ${editorAccent()}`)}
                    />
                )}
            </Show>
            <Show when={sel()}>
                {(r) => (
                    <div
                        class="pointer-events-none absolute"
                        style={ring(r(), `0 0 0 2px ${editorAccent()}`)}
                    />
                )}
            </Show>
        </>
    );
};
