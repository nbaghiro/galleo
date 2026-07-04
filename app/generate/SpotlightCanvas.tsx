import type { Component } from "solid-js";
import { createEffect, createSignal, For, Show } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes/library";
import { measureText, layoutSlide, layoutSlideSkeleton } from "@studio/canvas/render";
import { fitSlideContent } from "@studio/canvas/backends";
import { BuildCanvas } from "./BuildCanvas";
import { gen, placedSections, type SectionSlot } from "./session";
import { reduced } from "./typing";
import { ChevronUpIcon, CloseIcon } from "../components/icons";

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
