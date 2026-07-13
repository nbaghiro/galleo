import type { ArtifactContent } from "@model/artifact";
import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { previewContentProfile, resolveProfile, slideFrame } from "@engine/profile";
import { resolveTheme } from "@themes";
import { paintSectionStack } from "@canvas/render/backends";
import { slideElement, sectionSlideCount } from "@canvas/render/present";
import { backdropHostStyle, SlideProgress } from "./section";
import { FloatingBar } from "./overlay";
import { Z } from "./z";
import { IconButton } from "./button";
import { Icon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./icons";

export const PresentSurface: Component<{
    artifact: ArtifactContent;
    z?: number;
    autoFullscreen?: boolean;
    onExit?: () => void;
    children?: JSX.Element;
}> = (props) => {
    let overlay!: HTMLDivElement;
    let host!: HTMLDivElement;
    const [index, setIndex] = createSignal(0);
    const tokens = createMemo(() => resolveTheme(props.artifact.theme).tokens);
    const profile = createMemo(() => resolveProfile(props.artifact.format));
    const paged = createMemo(() => profile().kind === "paged");
    // A tall paged section spans several 16:9 slides; map a flat slide index ↔ (section, page).
    const slideCounts = createMemo(() =>
        paged()
            ? props.artifact.sections.map((s) => sectionSlideCount(s, tokens(), profile()))
            : [],
    );
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
        const { w, h } = slideFrame(section, profile());
        const slide = slideElement(section, tokens(), profile(), page);
        const k = Math.min((window.innerWidth - 24) / w, (window.innerHeight - 24) / h);
        slide.style.transform = `scale(${k})`;
        slide.style.transformOrigin = "center center";
        slide.style.borderRadius = "4px";
        host.replaceChildren(slide);
    };
    const renderContinuous = (): void => {
        if (!host) return;
        const fullW = host.clientWidth || window.innerWidth;
        // preview isn't bound to the editor's fixed reading-column width — let a doc widen with the viewport
        const prof = previewContentProfile(profile(), fullW);
        const stage = document.createElement("div");
        stage.style.cssText = `position:relative;width:${fullW}px`;
        const { height } = paintSectionStack(stage, props.artifact.sections, prof, tokens(), {
            fullW,
        });
        stage.style.height = `${height}px`;
        host.replaceChildren(stage);
    };
    const render = (): void => (paged() ? renderPaged() : renderContinuous());

    createEffect(() => {
        index();
        tokens();
        render();
    });

    const toggleFs = (): void => {
        if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {});
        else void overlay?.requestFullscreen?.()?.catch(() => {});
    };

    onMount(() => {
        if (props.autoFullscreen) void overlay?.requestFullscreen?.()?.catch(() => {});
        const onKey = (e: KeyboardEvent): void => {
            if (paged()) {
                if (e.key === "ArrowRight" || e.key === " " || e.key === "ArrowDown") next();
                else if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev();
                else if (e.key === "f" || e.key === "F") toggleFs();
                else if (e.key === "Escape") props.onExit?.();
                return;
            }
            if (e.key === " " || e.key === "ArrowDown" || e.key === "PageDown") {
                e.preventDefault();
                host?.scrollBy({ top: host.clientHeight * 0.9, behavior: "smooth" });
            } else if (e.key === "ArrowUp" || e.key === "PageUp") {
                e.preventDefault();
                host?.scrollBy({ top: -host.clientHeight * 0.9, behavior: "smooth" });
            } else if (e.key === "f" || e.key === "F") toggleFs();
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
                        ? "flex h-full w-full items-center justify-center overflow-auto"
                        : "h-full w-full overflow-y-auto"
                }
                style={hostStyle()}
                onClick={() => paged() && next()}
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
                        size="md"
                        rounded="lg"
                        tone="onDark"
                        title="Previous (←)"
                        onClick={prev}
                    >
                        <ChevronLeftIcon size={16} />
                    </IconButton>
                    <span class="px-1.5 font-mono text-[12px] tabular-nums text-white/80">
                        {index() + 1} / {total()}
                    </span>
                    <IconButton
                        size="md"
                        rounded="lg"
                        tone="onDark"
                        title="Next (→)"
                        onClick={next}
                    >
                        <ChevronRightIcon size={16} />
                    </IconButton>
                    <span class="mx-1 h-4 w-px bg-white/15" />
                </Show>
                <IconButton
                    size="md"
                    rounded="lg"
                    tone="onDark"
                    title="Fullscreen (F)"
                    onClick={toggleFs}
                >
                    <Icon name="fullscreen" size={16} />
                </IconButton>
                <Show when={props.onExit}>
                    <IconButton
                        size="md"
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
