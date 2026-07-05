import type { ArtifactContent } from "@model/artifact";
import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes/library";
import { backdropCss, paintSectionStack } from "@canvas/backends";
import { slideElement, SLIDE_W, SLIDE_H } from "@canvas/present";

// Standalone present surface — a chrome-free, full-screen render of an artifact, driven purely by the
// content (no editor). deck → one 16:9 slide per section with keyboard nav; doc/web → the sections stacked
// and scrollable. Reachable at /present/:id. Shares slide geometry + paint with the @canvas backends,
// so it stays editor-free (canvas must not import the editor).

const svg = (d: string): JSX.Element => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <path d={d} />
    </svg>
);
const ICON = {
    prev: "M15 18l-6-6 6-6",
    next: "M9 18l6-6-6-6",
    close: "M6 6l12 12M18 6L6 18",
    full: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
};

export const Present: Component<{ artifact: ArtifactContent; onExit?: () => void }> = (props) => {
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
    const exit = (): void => props.onExit?.();

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
        if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
        else overlay?.requestFullscreen?.()?.catch(() => {});
    };

    onMount(() => {
        overlay?.requestFullscreen?.()?.catch(() => {});
        const onKey = (e: KeyboardEvent): void => {
            if (paged()) {
                if (e.key === "ArrowRight" || e.key === " " || e.key === "ArrowDown") next();
                else if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev();
                else if (e.key === "f" || e.key === "F") toggleFs();
                else if (e.key === "Escape") exit();
                return;
            }
            if (e.key === " " || e.key === "ArrowDown" || e.key === "PageDown") {
                e.preventDefault();
                host?.scrollBy({ top: host.clientHeight * 0.9, behavior: "smooth" });
            } else if (e.key === "ArrowUp" || e.key === "PageUp") {
                e.preventDefault();
                host?.scrollBy({ top: -host.clientHeight * 0.9, behavior: "smooth" });
            } else if (e.key === "f" || e.key === "F") toggleFs();
            else if (e.key === "Escape") exit();
        };
        const onResize = (): void => render();
        window.addEventListener("keydown", onKey);
        window.addEventListener("resize", onResize);
        onCleanup(() => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onResize);
        });
    });

    const chrome =
        "grid h-7 w-7 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/10";
    const hostStyle = createMemo(
        (): JSX.CSSProperties =>
            paged()
                ? {}
                : {
                      background: backdropCss(props.artifact.background, tokens()),
                      "background-size": "cover",
                      "background-position": "center",
                  },
    );

    return (
        <div ref={overlay} class="fixed inset-0 z-50 bg-[#0a0a0c]">
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
                <div class="pointer-events-none absolute left-0 top-0 h-[3px] w-full bg-white/10">
                    <div
                        class="h-full bg-white/70 transition-all"
                        style={{ width: `${total() ? ((index() + 1) / total()) * 100 : 0}%` }}
                    />
                </div>
            </Show>
            <div
                class="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-black/55 px-2 py-1.5 backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
            >
                <Show when={paged()}>
                    <button class={chrome} title="Previous (←)" onClick={prev}>
                        {svg(ICON.prev)}
                    </button>
                    <span class="px-1.5 font-mono text-[12px] tabular-nums text-white/80">
                        {index() + 1} / {total()}
                    </span>
                    <button class={chrome} title="Next (→)" onClick={next}>
                        {svg(ICON.next)}
                    </button>
                    <span class="mx-1 h-4 w-px bg-white/15" />
                </Show>
                <button class={chrome} title="Fullscreen (F)" onClick={toggleFs}>
                    {svg(ICON.full)}
                </button>
                <button class={chrome} title="Exit (Esc)" onClick={exit}>
                    {svg(ICON.close)}
                </button>
            </div>
        </div>
    );
};
