// Selection chrome: the selection outline + section-level action buttons/toolbar drawn over the canvas.

import type { Region } from "@engine/node";
import type { Target } from "@model/target";
import type { Component } from "solid-js";
import { createMemo, createSignal, Show } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { regionId, sectionRegionId } from "@model/target";
import {
    editor,
    editorAccent,
    hover,
    regions,
    selection,
    addSectionAfter,
    duplicateSectionAt,
    moveSectionBy,
    removeSectionAt,
} from "../editor";
import { openSectionPrompt } from "../ai/section-gen";
import { drag } from "../canvas/dnd";
import { sectionDragId } from "./handles";
import { SectionLayoutPopup } from "../inspect/SectionLayoutPopup";
import { Icon } from "@ui/icons";
import { IconButton } from "@ui/button";
import { FloatingBar, Popover } from "@ui/overlay";
import { Separator } from "@ui/inputs";

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
    // Suppressed while an element OR section is being dragged: selection/hover are frozen and the painted
    // layout has shifted (lifted element / reflowed section), so a ring would strand over a stale spot.
    const sel = createMemo(() => (drag() || sectionDragId() ? null : regionFor(selection())));
    const hov = createMemo(() => {
        if (drag() || sectionDragId()) return null;
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

// The section whose Layout popup is open (else null). While open, SectionActions pins its bar to that
// section so the anchor button stays mounted even if the cursor drifts away.
const [layoutOpen, setLayoutOpen] = createSignal<string | null>(null);

// On section hover, a pill bar straddles the section's bottom edge: add a section below, generate, or open
// the inline Layout popup (smart-layout gallery + width/background) — which replaces the docked inspector.
export const SectionActions: Component = () => {
    const sid = createMemo(() => layoutOpen() ?? sectionOf(hover()));
    const box = createMemo(() => {
        const id = sid();
        return id ? (regions().find((r) => r.id === sectionRegionId(id))?.box ?? null) : null;
    });
    let pillRef: HTMLDivElement | undefined;

    return (
        <Show when={box()}>
            {(b) => (
                <>
                    <FloatingBar
                        ref={pillRef}
                        tone="panel"
                        rounded="full"
                        shadow="lg"
                        gap="0.5"
                        anchor="free"
                        class="absolute z-panel -translate-x-1/2"
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
                        <Separator vertical class="h-3.5" />
                        <button
                            class={action}
                            title="Generate a section here with AI"
                            onClick={() => openSectionPrompt(sid()!)}
                        >
                            <Icon name="sparkle" size={13} /> Generate
                        </button>
                        <Separator vertical class="h-3.5" />
                        <button
                            class={action}
                            title="Section layout & background"
                            onClick={() => setLayoutOpen(sid())}
                        >
                            <Icon name="layout" size={13} /> Layout
                        </button>
                    </FloatingBar>
                    <Popover
                        anchor={() => pillRef}
                        open={layoutOpen() !== null}
                        onClose={() => setLayoutOpen(null)}
                        fixedWidth={512}
                        estHeight={560}
                        align="center"
                        panelClass="p-3.5"
                    >
                        <SectionLayoutPopup section={sid()!} />
                    </Popover>
                </>
            )}
        </Show>
    );
};

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
                <FloatingBar
                    tone="panel"
                    rounded="lg"
                    pad="sm"
                    shadow="lg"
                    anchor="free"
                    class="absolute z-panel"
                    style={{ left: `${b().x + 10}px`, top: `${b().y + 10}px` }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="ink"
                        title="Move up"
                        onClick={() => moveSectionBy(sid()!, -1)}
                    >
                        <Icon name="chevronUp" size={15} />
                    </IconButton>
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="ink"
                        title="Move down"
                        onClick={() => moveSectionBy(sid()!, 1)}
                    >
                        <Icon name="chevronDown" size={15} />
                    </IconButton>
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="ink"
                        title="Duplicate"
                        onClick={() => duplicateSectionAt(sid()!)}
                    >
                        <Icon name="duplicate" size={14} />
                    </IconButton>
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="ink"
                        title="Add section below"
                        onClick={() => addSectionAfter(sid()!)}
                    >
                        <Icon name="plus" size={15} />
                    </IconButton>
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="accent"
                        title="Delete section"
                        onClick={() => removeSectionAt(sid()!)}
                    >
                        <Icon name="close" size={14} />
                    </IconButton>
                </FloatingBar>
            )}
        </Show>
    );
};
