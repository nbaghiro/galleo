import type { ArtifactContent } from "@model/artifact";
import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes";
import { paintSectionStack } from "@canvas/render/backends";
import { slideElement, SLIDE_W, SLIDE_H } from "@canvas/render/present";
import { backdropHostStyle, SlideProgress } from "./section";
import { FloatingBar } from "./overlay";
import { IconButton } from "./button";
import { Icon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./icons";

// The shared present/read surface — a chrome-free full-screen render of an artifact driven purely by its
// content: deck → one scaled 16:9 slide per section with keyboard nav; doc/web → the sections stacked and
// scrollable. Paints through the @canvas backends (pure TS). The in-app present route and the public
// viewer both build on it, passing their own chrome (exit button, branding) via props — so the paint +
// nav + control-bar logic lives here once instead of forked across the two surfaces.
export const PresentSurface: Component<{
    artifact: ArtifactContent;
    z?: number; // overlay z-index (default 50)
    autoFullscreen?: boolean; // best-effort requestFullscreen on mount (in-app present)
    onExit?: () => void; // when set, shows an Exit control + wires Esc-to-exit
    children?: JSX.Element; // extra overlay content (e.g. a branding watermark)
}> = (props) => {
    let overlay!: HTMLDivElement;
    let host!: HTMLDivElement;
    const [index, setIndex] = createSignal(0);
    const tokens = createMemo(() => resolveTheme(props.artifact.theme).tokens);
    const profile = createMemo(() => resolveProfile(props.artifact.format));
    const paged = createMemo(() => profile().kind === "paged");
    const total = (): number => props.artifact.sections.length;
    const clamp = (i: number): number => Math.max(0, Math.min(total() - 1, i));
    const next = (): void => {
        setIndex((i) => clamp(i + 1));
    };
    const prev = (): void => {
        setIndex((i) => clamp(i - 1));
    };

    // deck: the current section as a scaled 16:9 slide. doc/web: all sections stacked + scrollable.
    const renderPaged = (): void => {
        const section = props.artifact.sections[index()];
        if (!host || !section) return;
        const slide = slideElement(section, tokens(), profile());
        const k = Math.min((window.innerWidth - 24) / SLIDE_W, (window.innerHeight - 24) / SLIDE_H);
        slide.style.transform = `scale(${k})`;
        slide.style.transformOrigin = "center center";
        slide.style.borderRadius = "4px";
        host.replaceChildren(slide);
    };
    const renderContinuous = (): void => {
        if (!host) return;
        const fullW = host.clientWidth || window.innerWidth;
        const stage = document.createElement("div");
        stage.style.cssText = `position:relative;width:${fullW}px`;
        const { height } = paintSectionStack(stage, props.artifact.sections, profile(), tokens(), {
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
        <div ref={overlay} class="fixed inset-0 bg-[#0a0a0c]" style={{ "z-index": props.z ?? 50 }}>
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
