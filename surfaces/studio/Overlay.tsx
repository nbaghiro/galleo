import type { Rect } from "@engine/node";
import type { Target } from "@model/address";
import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { regionId } from "@model/address";
import { resolveTheme } from "@themes/library";
import { editor, hover, regions, selection } from "./editor";

const accent = (): string => resolveTheme(editor.artifact.theme).tokens.accent;

// Selection + hover highlights, drawn as box-shadow rings (no layout impact) over the painted canvas.
// Reads geometry from the engine-reported regions, so it tracks exactly what the engine laid out.

function boxFor(t: Target | null): Rect | null {
    if (!t) return null;
    const id = regionId(t);
    return regions().find((r) => r.id === id)?.box ?? null;
}

const ring = (b: Rect, shadow: string) => ({
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.w}px`,
    height: `${b.h}px`,
    "box-shadow": shadow,
});

export const Overlay: Component = () => {
    const sel = createMemo(() => boxFor(selection()));
    const hov = createMemo(() => {
        const h = hover();
        if (!h) return null;
        const s = selection();
        if (s && regionId(s) === regionId(h)) return null;
        return boxFor(h);
    });
    return (
        <>
            <Show when={hov()}>
                {(b) => (
                    <div
                        class="pointer-events-none absolute rounded-[7px] opacity-50"
                        style={ring(b(), `0 0 0 1.5px ${accent()}`)}
                    />
                )}
            </Show>
            <Show when={sel()}>
                {(b) => (
                    <div
                        class="pointer-events-none absolute rounded-[7px]"
                        style={ring(b(), `0 0 0 2px ${accent()}`)}
                    />
                )}
            </Show>
        </>
    );
};
