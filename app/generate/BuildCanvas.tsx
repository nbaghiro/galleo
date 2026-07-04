import type { Section } from "@model/artifact";
import type { Component } from "solid-js";
import { createEffect, createSignal, For, on, onMount, Show } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes/library";
import { backdropCss, paint } from "@studio/canvas/backends";
import {
    measureText,
    layoutSection,
    layoutSectionSkeleton,
    SECTION_GAP,
} from "@studio/canvas/render";
import { activeStatus, gen, placedSections } from "./session";

// The live-build canvas: the SAME engine paint the editor uses. Finished sections are rendered with a
// keyed <For> over the reactive placed list — Solid mounts exactly one block per finished section (keyed
// by the stable section reference), so the stack can never drift from the list. The active beat's
// "generating" state is a REAL section run through the engine as a skeleton (layoutSectionSkeleton), so
// the placeholder occupies the exact width/height/grid the finished section will — shimmer animated over.
const PAD = 28;
const EASE = "cubic-bezier(.2,.7,.2,1)";
const reduced = (): boolean =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const STATUS_LABEL: Record<string, string> = {
    active: "Shaping…",
    writing: "Writing…",
    image: "Sourcing image…",
};

// shared geometry: how wide a section lays out in the current format (full-bleed vs centered column)
function geometry(
    section: Section,
    avail: number,
): {
    tk: ReturnType<typeof resolveTheme>["tokens"];
    p: ReturnType<typeof resolveProfile>;
    gap: number;
    layoutW: number;
} {
    const tk = resolveTheme(gen.theme).tokens;
    const p = resolveProfile(gen.format);
    const web = p.id === "web";
    const gap = p.kind === "continuous" ? 0 : SECTION_GAP;
    const contentW = Math.min(avail - 64, p.maxContentWidth ?? 1080);
    const bleed = (section.bleed ?? false) || web;
    return { tk, p, gap, layoutW: bleed ? avail : contentW };
}

export const BuildCanvas: Component = () => {
    let host!: HTMLDivElement;
    const tokens = (): ReturnType<typeof resolveTheme>["tokens"] => resolveTheme(gen.theme).tokens;
    const availWidth = (): number => host?.clientWidth || 1100;

    createEffect(() => {
        host.style.background = backdropCss(gen.finalContent?.background, tokens());
    });
    // keep the freshest content in view as sections land / the ghost advances
    createEffect(
        on([(): number => placedSections().length, activeStatus], () => {
            queueMicrotask(() =>
                host?.scrollTo({ top: host.scrollHeight, behavior: reduced() ? "auto" : "smooth" }),
            );
        }),
    );

    return (
        <div
            ref={host}
            class="h-full w-full overflow-y-auto"
            style={{ "padding-top": `${PAD}px`, "padding-bottom": `${PAD}px` }}
        >
            <For each={placedSections()}>
                {(section) => <PlacedBlock section={section} avail={availWidth} />}
            </For>
            <Show when={gen.phase === "building" && activeStatus() && activeStatus() !== "done"}>
                <GhostSection avail={availWidth} />
            </Show>
        </div>
    );
};

// One finished section, painted once through the engine in normal flow — the browser stacks the blocks
// so they can never overlap. Reveals with a clip-path wipe + image deblur on mount.
const PlacedBlock: Component<{ section: Section; avail: () => number }> = (props) => {
    let box!: HTMLDivElement;
    const [dim, setDim] = createSignal({ w: 0, h: 0, gap: 0 });
    onMount(() => {
        const { tk, p, gap, layoutW } = geometry(props.section, props.avail());
        const { commands, height } = layoutSection(props.section, layoutW, measureText, tk, p);
        paint(commands, box);
        setDim({ w: layoutW, h: height, gap });
        if (reduced()) return;
        box.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 420,
            easing: EASE,
            fill: "both",
        });
        box.animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)" }], {
            duration: 560,
            easing: EASE,
            fill: "both",
        });
        box.querySelectorAll("img").forEach((img) =>
            img.animate(
                [
                    { filter: "blur(14px)", transform: "scale(1.04)", opacity: 0.4 },
                    { filter: "blur(0px)", transform: "none", opacity: 1 },
                ],
                { duration: 640, easing: EASE, fill: "both" },
            ),
        );
    });
    return (
        <div
            ref={box}
            style={{
                position: "relative",
                width: `${dim().w}px`,
                height: `${dim().h}px`,
                margin: `0 auto ${dim().gap}px`,
            }}
        />
    );
};

// The "generating" section — the real active section laid out through the engine as a skeleton, so it
// matches the finished geometry exactly, with the accent shimmer + status label over it.
const GhostSection: Component<{ avail: () => number }> = (props) => {
    let box!: HTMLDivElement;
    const [dim, setDim] = createSignal({ w: 0, h: 0 });
    const slot = (): (typeof gen.sections)[number] | undefined =>
        gen.sections.find((s) => s.id === gen.activeSection);
    const status = (): string => activeStatus() ?? "active";

    createEffect(() => {
        const sec = slot()?.section;
        if (!sec || !box) return;
        const { tk, p, layoutW } = geometry(sec, props.avail());
        const { commands, height } = layoutSectionSkeleton(sec, layoutW, measureText, tk, p);
        paint(commands, box); // paint() clears the host first, so reuse across beats is safe
        setDim({ w: layoutW, h: height });
    });

    return (
        <div class="relative mx-auto mb-[22px]" style={{ width: `${dim().w}px` }}>
            <div ref={box} style={{ width: `${dim().w}px`, height: `${dim().h}px` }} />
            <div class="gen-shimmer pointer-events-none absolute inset-0 opacity-45" />
            <div class="pointer-events-none absolute bottom-4 left-7 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
                <span class="h-1.5 w-1.5 animate-ping rounded-full bg-accent" />
                {STATUS_LABEL[status()] ?? "Composing…"}
            </div>
        </div>
    );
};
