import type { ArtifactContent } from "@model/artifact";
import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { previewContentProfile, profileFor, sectionFrame } from "@engine/profile";
import { resolveTheme } from "@themes";
import {
    createSectionStackCache,
    paintSectionStack,
    type StackWindow,
} from "@canvas/render/backends";
import { stackWindow, windowMoved } from "@canvas/render/window";
import { slideElement, sectionSlideCount } from "@canvas/render/present";
import { backdropHostStyle, SlideProgress } from "./section";
import { FloatingBar } from "./overlay";
import { Z } from "./z";
import { IconButton } from "./button";
import { classifySwipe, tapZone } from "./gesture";
import { isCoarsePointer, isPhone } from "./viewport";
import { Icon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./icons";

export const PresentSurface: Component<{
    artifact: ArtifactContent;
    z?: number;
    autoFullscreen?: boolean;
    // read-only viewing rather than presenting: drops the fullscreen control and its key
    viewOnly?: boolean;
    onExit?: () => void;
    // furthest slide (paged) or section (continuous) reached, 0-based, + total
    onProgress?: (reached: number, total: number) => void;
    children?: JSX.Element;
}> = (props) => {
    let overlay!: HTMLDivElement;
    let host!: HTMLDivElement;
    let sectionTops: number[] = []; // continuous mode: y offset of each section, from the last paint
    const [index, setIndex] = createSignal(0);
    const tokens = createMemo(() => resolveTheme(props.artifact.theme).tokens);
    const profile = createMemo(() => profileFor(props.artifact));
    const paged = createMemo(() => profile().kind === "paged");
    // A tall paged section spans several 16:9 slides; map a flat slide index ↔ (section, page).
    // Counting lays out a section, so count only up to the one on screen; assume 1 slide for the rest.
    const [counted, setCounted] = createSignal(0);
    const slideCounts = createMemo(() => {
        if (!paged()) return [];
        const upTo = Math.max(counted(), 1);
        return props.artifact.sections.map((s, i) =>
            i < upTo ? sectionSlideCount(s, tokens(), profile()) : 1,
        );
    });
    const total = (): number =>
        paged() ? slideCounts().reduce((a, b) => a + b, 0) : props.artifact.sections.length;
    const locate = (flat: number): { si: number; page: number } => {
        const counts = slideCounts();
        let n = Math.max(0, flat);
        for (let i = 0; i < counts.length; i++) {
            if (n < counts[i]!) return { si: i, page: n };
            n -= counts[i]!;
        }
        const last = counts.length - 1;
        return { si: Math.max(0, last), page: Math.max(0, (counts[last] ?? 1) - 1) };
    };
    const clamp = (i: number): number => Math.max(0, Math.min(total() - 1, i));
    const next = (): void => {
        setIndex((i) => clamp(i + 1));
    };
    const prev = (): void => {
        setIndex((i) => clamp(i - 1));
    };
    // Keep the index in range if the slide count changes mid-present (e.g. a theme swap re-paginates).
    createEffect(() => {
        const t = total();
        setIndex((i) => Math.max(0, Math.min(t - 1, i)));
    });

    const renderPaged = (): void => {
        if (!host) return;
        const { si, page } = locate(index());
        const section = props.artifact.sections[si];
        if (!section) return;
        const { w, h } = sectionFrame(section, profile());
        const slide = slideElement(section, tokens(), profile(), page);
        const k = Math.min((window.innerWidth - 24) / w, (window.innerHeight - 24) / h);
        slide.style.transform = `scale(${k})`;
        slide.style.transformOrigin = "center center";
        slide.style.borderRadius = "4px";
        host.replaceChildren(slide);
    };
    // one stage for the life of the surface, so a repaint on scroll swaps layers instead of the document
    let stage: HTMLDivElement | null = null;
    const stackCache = createSectionStackCache();
    let lastWindow: StackWindow | null = null;

    const renderContinuous = (): void => {
        if (!host) return;
        const fullW = host.clientWidth || window.innerWidth;
        // preview isn't bound to the editor's fixed reading-column width, so a doc widens with the viewport
        const prof = previewContentProfile(profile(), fullW, isPhone());
        if (!stage) {
            stage = document.createElement("div");
            host.replaceChildren(stage);
        }
        stage.style.cssText = `position:relative;width:${fullW}px`;
        const viewH = host.clientHeight || window.innerHeight;
        const win = stackWindow(host.scrollTop, viewH);
        lastWindow = win;
        const { tops, height } = paintSectionStack(stage, props.artifact.sections, prof, tokens(), {
            fullW,
            cache: stackCache,
            window: win,
        });
        sectionTops = tops;
        stage.style.height = `${height}px`;
        reportScrollProgress();
    };
    const render = (): void => (paged() ? renderPaged() : renderContinuous());

    const onScrollWindow = (): void => {
        if (paged() || !host) return;
        const viewH = host.clientHeight || window.innerHeight;
        if (windowMoved(lastWindow, stackWindow(host.scrollTop, viewH), viewH)) renderContinuous();
    };

    // continuous: a section counts as reached once its top scrolls into view
    const reportScrollProgress = (): void => {
        if (!props.onProgress || !host || !sectionTops.length) return;
        const seen = host.scrollTop + host.clientHeight;
        let reached = 0;
        for (let i = 0; i < sectionTops.length; i++) if (sectionTops[i]! < seen) reached = i;
        props.onProgress(reached, props.artifact.sections.length);
    };

    createEffect(() => {
        index();
        tokens();
        render();
    });
    createEffect(() => {
        if (!paged()) return;
        const { si } = locate(index());
        setCounted((c) => Math.max(c, si + 2)); // count one ahead of where the viewer is
        props.onProgress?.(index(), total());
    });

    const toggleFs = (): void => {
        if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {});
        else void overlay?.requestFullscreen?.()?.catch(() => {});
    };

    // Fine pointer: click anywhere advances. Coarse: swipe, plus a back zone on the leading edge.
    let down: { x: number; y: number; t: number } | null = null;
    const onPointerDown = (e: PointerEvent): void => {
        if (!paged()) return;
        down = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    };
    const onPointerUp = (e: PointerEvent): void => {
        if (!paged()) return;
        const start = down;
        down = null;
        if (!start) return;
        if (!isCoarsePointer()) {
            next();
            return;
        }
        const swipe = classifySwipe({
            dx: e.clientX - start.x,
            dy: e.clientY - start.y,
            dt: e.timeStamp - start.t,
        });
        const intent = swipe ?? tapZone(e.clientX, host?.clientWidth ?? 0);
        if (intent === "prev") prev();
        else next();
    };

    onMount(() => {
        if (props.autoFullscreen) void overlay?.requestFullscreen?.()?.catch(() => {});
        const onKey = (e: KeyboardEvent): void => {
            if (paged()) {
                if (e.key === "ArrowRight" || e.key === " " || e.key === "ArrowDown") next();
                else if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev();
                else if ((e.key === "f" || e.key === "F") && !props.viewOnly) toggleFs();
                else if (e.key === "Escape") props.onExit?.();
                return;
            }
            if (e.key === " " || e.key === "ArrowDown" || e.key === "PageDown") {
                e.preventDefault();
                host?.scrollBy({ top: host.clientHeight * 0.9, behavior: "smooth" });
            } else if (e.key === "ArrowUp" || e.key === "PageUp") {
                e.preventDefault();
                host?.scrollBy({ top: -host.clientHeight * 0.9, behavior: "smooth" });
            } else if ((e.key === "f" || e.key === "F") && !props.viewOnly) toggleFs();
            else if (e.key === "Escape") props.onExit?.();
        };
        const onResize = (): void => render();
        window.addEventListener("keydown", onKey);
        window.addEventListener("resize", onResize);
        onCleanup(() => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onResize);
        });
    });

    const hostStyle = createMemo(
        (): JSX.CSSProperties => backdropHostStyle(paged(), props.artifact.background, tokens()),
    );
    const ctrl = (): "md" | "touch" => (isCoarsePointer() ? "touch" : "md");

    return (
        <div
            ref={overlay}
            class="fixed inset-0 bg-[#0a0a0c]"
            style={{ "z-index": props.z ?? Z.present }}
        >
            <div
                ref={host}
                class={
                    paged()
                        ? // pan-y claims horizontal, so a swipe never triggers browser back-navigation
                          "flex h-full w-full touch-pan-y select-none items-center justify-center overflow-auto overscroll-x-contain"
                        : "h-full w-full overflow-y-auto"
                }
                style={hostStyle()}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onScroll={() => {
                    if (paged()) return;
                    reportScrollProgress();
                    onScrollWindow();
                }}
            />
            <Show when={paged()}>
                <SlideProgress index={index()} total={total()} />
            </Show>
            <FloatingBar
                tone="dark"
                anchor="bottomCenter"
                rounded="xl"
                onClick={(e) => e.stopPropagation()}
            >
                <Show when={paged()}>
                    <IconButton
                        size={ctrl()}
                        rounded="lg"
                        tone="onDark"
                        title="Previous (←)"
                        onClick={prev}
                    >
                        <ChevronLeftIcon size={16} />
                    </IconButton>
                    <span class="whitespace-nowrap px-1.5 font-mono text-[12px] tabular-nums text-white/80">
                        {index() + 1} / {total()}
                    </span>
                    <IconButton
                        size={ctrl()}
                        rounded="lg"
                        tone="onDark"
                        title="Next (→)"
                        onClick={next}
                    >
                        <ChevronRightIcon size={16} />
                    </IconButton>
                    <span class="mx-1 h-4 w-px bg-white/15" />
                </Show>
                <Show when={!props.viewOnly}>
                    <IconButton
                        size={ctrl()}
                        rounded="lg"
                        tone="onDark"
                        title="Fullscreen (F)"
                        onClick={toggleFs}
                    >
                        <Icon name="fullscreen" size={16} />
                    </IconButton>
                </Show>
                <Show when={props.onExit}>
                    <IconButton
                        size={ctrl()}
                        rounded="lg"
                        tone="onDark"
                        title="Exit (Esc)"
                        onClick={() => props.onExit?.()}
                    >
                        <CloseIcon size={16} />
                    </IconButton>
                </Show>
            </FloatingBar>
            {props.children}
        </div>
    );
};
