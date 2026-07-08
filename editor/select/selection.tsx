// Selection chrome: the selection outline + section-level action buttons/toolbar drawn over the canvas.

import type { Region } from "@engine/node";
import type { Target } from "@model/target";
import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { regionId, sectionRegionId } from "@model/target";
import {
    editor,
    editorAccent,
    hover,
    regions,
    selection,
    addSectionAfter,
    setSelection,
    duplicateSectionAt,
    moveSectionBy,
    removeSectionAt,
} from "../editor";
import { openSectionPrompt } from "../ai/section-gen";
import { Icon } from "../icons";

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

function sectionOf(t: Target | null): string | null {
    if (!t) return null;
    if (t.kind === "element") return t.address.section;
    return t.section;
}

const action =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-canvas";

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
                    <button
                        class={action}
                        title="Add a blank section below"
                        onClick={() => addSectionAfter(sid()!)}
                    >
                        <Icon name="plus" size={13} /> Section
                    </button>
                    <span class="h-3.5 w-px bg-line" />
                    <button
                        class={action}
                        title="Generate a section here with AI"
                        onClick={() => openSectionPrompt(sid()!)}
                    >
                        <Icon name="sparkle" size={13} /> Generate
                    </button>
                    <span class="h-3.5 w-px bg-line" />
                    <button
                        class={action}
                        title="Section layout & background"
                        onClick={() => setSelection({ kind: "section", section: sid()! })}
                    >
                        <Icon name="layout" size={13} /> Layout
                    </button>
                </div>
            )}
        </Show>
    );
};

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
