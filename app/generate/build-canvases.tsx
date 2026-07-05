// The generation view-direction variants: the base build canvas + the spotlight variant + the extra HUD variants (a dev toggle).

import type { Section } from "@model/artifact";
import type { Component } from "solid-js";
import { createEffect, createSignal, For, on, onMount, Show } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes/library";
import { backdropCss, paint, fitSlideContent } from "@canvas/backends";
import {
    measureText,
    layoutSection,
    layoutSectionSkeleton,
    SECTION_GAP,
    layoutSlide,
    layoutSlideSkeleton,
} from "@canvas/commands";
import { activeStatus, gen, placedSections, type SectionSlot, doneBeats } from "./session";
import { reduced, TypingLine } from "./gen-view";
import { ChevronUpIcon, CloseIcon } from "../components/icons";

// The live-build canvas: the SAME engine paint the editor uses. Finished sections are rendered with a
// keyed <For> over the reactive placed list — Solid mounts exactly one block per finished section (keyed
// by the stable section reference), so the stack can never drift from the list. The active beat's
// "generating" state is a REAL section run through the engine as a skeleton (layoutSectionSkeleton), so
// the placeholder occupies the exact width/height/grid the finished section will — shimmer animated over.
const PAD = 28;
const EASE = "cubic-bezier(.2,.7,.2,1)";

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

// SPOTLIGHT: the SAME live build canvas as every direction (each section narrates + skeletons in as it's
// generated), lit by an accent beam — with a centered storyboard filmstrip below where the composing
// section shows in the SAME skeleton loader state as the canvas, then fills into a real thumbnail.
const SLIDE_W = 1280;
const SLIDE_H = 720;
const THUMB_W = 172;
const THUMB_H = Math.round((THUMB_W * SLIDE_H) / SLIDE_W); // 16:9

export const SpotlightCanvas: Component = () => {
    const [open, setOpen] = createSignal(true);
    return (
        <div class="flex h-full w-full flex-col">
            <div class="relative min-h-0 flex-1 overflow-hidden">
                <div class="absolute inset-0">
                    <BuildCanvas />
                </div>
                <div class="gen-spotbeam pointer-events-none absolute inset-0 z-10" />
            </div>
            <Show when={open()} fallback={<StripHandle onOpen={() => setOpen(true)} />}>
                <StoryStrip onClose={() => setOpen(false)} />
            </Show>
        </div>
    );
};

const StripHandle: Component<{ onOpen: () => void }> = (props) => (
    <button
        class="flex flex-none items-center gap-3 border-t-2 border-accent/45 bg-panel px-5 py-2.5 text-left font-mono text-[11px] text-muted transition hover:text-ink"
        title="Show storyboard"
        onClick={props.onOpen}
    >
        <span class="text-accent">
            <ChevronUpIcon size={13} />
        </span>{" "}
        Show storyboard
        <span class="text-soft">
            · {placedSections().length}/{gen.sections.length || "—"} sections
        </span>
        <Show when={gen.phase === "building"}>
            <span class="ml-auto h-2 w-2 animate-pulse rounded-full bg-accent" />
        </Show>
    </button>
);

const StoryStrip: Component<{ onClose: () => void }> = (props) => {
    let scroll!: HTMLDivElement;
    // every section that has started (composing or done) — queued ones aren't shown yet
    const started = (): SectionSlot[] =>
        gen.sections.filter((s) => !!s.section && s.status !== "queued");
    createEffect(() => {
        const n = started().length;
        queueMicrotask(() => {
            if (n >= 0)
                scroll?.scrollTo({
                    left: scroll.scrollWidth,
                    behavior: reduced() ? "auto" : "smooth",
                });
        });
    });
    return (
        <div class="relative flex-none border-t-2 border-accent/45 bg-panel">
            <button
                class="absolute right-2.5 top-2 z-10 grid h-[24px] w-[24px] place-items-center rounded-md text-[13px] text-muted transition hover:bg-canvas hover:text-ink"
                title="Hide storyboard"
                onClick={props.onClose}
            >
                <CloseIcon size={14} />
            </button>
            <div class="flex items-center justify-center gap-2 px-4 pt-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Storyboard
                <span class="tracking-normal text-soft">
                    · {placedSections().length}/{gen.sections.length || "—"} sections
                </span>
            </div>
            {/* centered so frames grow from the middle, falling back to scroll-from-start on overflow */}
            <div
                ref={scroll}
                class="flex items-start gap-3 overflow-x-auto px-4 pb-3 pt-2.5 [justify-content:safe_center]"
            >
                <For each={started()}>{(slot, i) => <StripThumb slot={slot} index={i()} />}</For>
                <Show when={started().length === 0}>
                    <span class="py-6 text-[12px] text-muted">
                        sections appear here as they're composed…
                    </span>
                </Show>
            </div>
        </div>
    );
};

const StripThumb: Component<{ slot: SectionSlot; index: number }> = (props) => {
    let host!: HTMLDivElement;
    const generating = (): boolean => props.slot.status !== "done";
    createEffect(() => {
        const sec = props.slot.section;
        if (!sec || !host) return;
        const tk = resolveTheme(gen.theme).tokens;
        const p = resolveProfile(gen.format);
        // the studio's present mechanism: each section fit + centered on a 16:9 slide (real, or the SAME
        // engine skeleton while composing), then scaled down to the thumbnail.
        const { commands, height } = generating()
            ? layoutSlideSkeleton(sec, SLIDE_W, SLIDE_H, measureText, tk, p)
            : layoutSlide(sec, SLIDE_W, SLIDE_H, measureText, tk, p);
        const content = fitSlideContent(commands, height, SLIDE_W, SLIDE_H);
        const slide = document.createElement("div");
        slide.style.cssText = `position:relative;width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;background:${tk.bg};transform:scale(${THUMB_W / SLIDE_W});transform-origin:top left`;
        slide.appendChild(content);
        host.replaceChildren(slide);
    });
    return (
        <div class="flex flex-none flex-col items-center gap-1">
            <div
                class={`relative overflow-hidden rounded-md border shadow-sm transition-colors ${
                    generating() ? "border-accent" : "border-line"
                }`}
                style={{ width: `${THUMB_W}px`, height: `${THUMB_H}px` }}
            >
                <div ref={host} />
                <Show when={generating() && !reduced()}>
                    <div class="gen-shimmer pointer-events-none absolute inset-0 opacity-40" />
                </Show>
            </div>
            <span class={`font-mono text-[8.5px] ${generating() ? "text-accent" : "text-muted"}`}>
                {String(props.index + 1).padStart(2, "0")}
            </span>
        </div>
    );
};

// ── HUD: full-bleed canvas + viewfinder brackets + a frosted-glass widget (beat segments + narration) ──
export const HudCanvas: Component = () => {
    const [open, setOpen] = createSignal(true);
    return (
        <div class="relative h-full w-full overflow-hidden">
            <div class="absolute inset-0">
                <BuildCanvas />
            </div>
            <div class="pointer-events-none absolute left-3 top-3 z-20 h-6 w-6 rounded-[2px] border-l-2 border-t-2 border-accent/50" />
            <div class="pointer-events-none absolute right-3 top-3 z-20 h-6 w-6 rounded-[2px] border-r-2 border-t-2 border-accent/50" />
            <div class="pointer-events-none absolute bottom-3 left-3 z-20 h-6 w-6 rounded-[2px] border-b-2 border-l-2 border-accent/50" />
            <div class="pointer-events-none absolute right-4 top-4 z-20 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                {gen.format}.galleo · live
            </div>
            <Show when={open()} fallback={<HudHandle onOpen={() => setOpen(true)} />}>
                <div class="absolute bottom-5 right-5 z-20 w-[360px] rounded-xl border border-accent/35 bg-panel/70 p-3 shadow-2xl backdrop-blur-xl">
                    <HudSegs onClose={() => setOpen(false)} />
                    <HudNarr />
                </div>
            </Show>
        </div>
    );
};

const HudHandle: Component<{ onOpen: () => void }> = (props) => {
    const done = doneBeats;
    return (
        <button
            class="absolute bottom-5 right-5 z-20 flex items-center gap-2 rounded-full border border-accent/35 bg-panel/70 px-3.5 py-2 font-mono text-[11px] text-soft shadow-2xl backdrop-blur-xl transition hover:text-ink"
            title="Show HUD"
            onClick={props.onOpen}
        >
            <Show when={gen.phase === "building"}>
                <span class="h-2 w-2 animate-pulse rounded-full bg-accent" />
            </Show>
            <span class="text-accent">galleo@agent</span>
            <span>
                · beat {done()}/{gen.beats.length}
            </span>
            <span class="text-accent">
                <ChevronUpIcon size={12} />
            </span>
        </button>
    );
};

const HudSegs: Component<{ onClose: () => void }> = (props) => {
    const done = doneBeats;
    return (
        <div class="mb-2.5">
            <div class="mb-2 flex gap-1">
                <For each={gen.beats}>
                    {(b) => (
                        <div
                            class={`h-1 flex-1 rounded-full ${
                                b.status === "done"
                                    ? "bg-accent"
                                    : b.status === "active"
                                      ? "animate-pulse bg-accent/60"
                                      : "bg-line"
                            }`}
                        />
                    )}
                </For>
            </div>
            <div class="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                <span class="flex items-center gap-1.5">
                    <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> galleo@agent
                </span>
                <span class="flex items-center gap-2">
                    <span>
                        beat {done()}/{gen.beats.length}
                    </span>
                    <button
                        class="grid h-[18px] w-[18px] place-items-center rounded text-[12px] transition hover:bg-canvas hover:text-ink"
                        title="Hide"
                        onClick={props.onClose}
                    >
                        <CloseIcon size={13} />
                    </button>
                </span>
            </div>
        </div>
    );
};

const HudNarr: Component = () => {
    let scroll!: HTMLDivElement;
    createEffect(() => {
        const n = gen.narration.length;
        queueMicrotask(() => {
            if (n >= 0)
                scroll?.scrollTo({
                    top: scroll.scrollHeight,
                    behavior: reduced() ? "auto" : "smooth",
                });
        });
    });
    return (
        <div
            ref={scroll}
            class="max-h-[120px] overflow-y-auto font-mono text-[11px] leading-relaxed"
        >
            <For each={gen.narration}>
                {(line) => (
                    <div class={`flex gap-2 ${line.done ? "opacity-45" : "opacity-100"}`}>
                        <span class="flex-none text-accent">›</span>
                        <span class="min-w-0 flex-1 text-ink">
                            <Show when={line.done} fallback={<TypingLine text={line.text} />}>
                                {line.text}
                            </Show>
                            <Show when={line.mono}>
                                <span class="text-accent">{line.mono}</span>
                            </Show>
                        </span>
                    </div>
                )}
            </For>
        </div>
    );
};
