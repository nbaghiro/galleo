import type { Component } from "solid-js";
import { createEffect, createMemo, onCleanup, onMount, Show } from "solid-js";
import { resolveTheme } from "@themes/library";
import { backdropCss } from "./backdrop";
import { paint } from "./dom-backend";
import { editor, exitPresent, nextSlide, presenting, prevSlide, slideIndex } from "./editor";
import { measureText } from "./measure";
import { layoutSection } from "./render";

const SLIDE_W = 1280;

// Fullscreen presentation: one section per slide, scaled to fit, arrow/click/space to navigate.
export const Present: Component = () => {
    let host!: HTMLDivElement;
    const theme = createMemo(() => resolveTheme(editor.artifact.theme).tokens);

    const render = (): void => {
        const s = editor.artifact.sections[slideIndex()];
        if (!s || !host) return;
        const { commands, height } = layoutSection(s, SLIDE_W, measureText, theme());
        const inner = document.createElement("div");
        inner.style.cssText = `position:relative;width:${SLIDE_W}px;height:${height}px`;
        paint(commands, inner);
        const scale = Math.min(
            (window.innerWidth - 96) / SLIDE_W,
            (window.innerHeight - 96) / height,
            1,
        );
        inner.style.transform = `scale(${scale})`;
        inner.style.transformOrigin = "center center";
        host.replaceChildren(inner);
    };

    // render() reads editor.artifact.sections[slideIndex()] + theme(), so it re-runs on nav/edit/theme.
    createEffect(() => {
        if (presenting()) render();
    });

    onMount(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (!presenting()) return;
            if (e.key === "ArrowRight" || e.key === " ") nextSlide();
            else if (e.key === "ArrowLeft") prevSlide();
            else if (e.key === "Escape") exitPresent();
        };
        const onResize = (): void => render();
        window.addEventListener("keydown", onKey);
        window.addEventListener("resize", onResize);
        onCleanup(() => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onResize);
        });
    });

    return (
        <Show when={presenting()}>
            <div
                class="fixed inset-0 z-50 flex items-center justify-center bg-cover bg-center"
                style={{
                    background: backdropCss(editor.artifact.background, theme()),
                    "background-size": "cover",
                    "background-position": "center",
                }}
                onClick={() => nextSlide()}
            >
                <div ref={host} class="flex items-center justify-center" />
                <button
                    class="absolute right-5 top-5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
                    style={{ color: theme().muted }}
                    onClick={(e) => {
                        e.stopPropagation();
                        exitPresent();
                    }}
                >
                    Esc ✕
                </button>
                <div
                    class="absolute bottom-5 right-6 font-mono text-[12px]"
                    style={{ color: theme().muted }}
                >
                    {slideIndex() + 1} / {editor.artifact.sections.length}
                </div>
            </div>
        </Show>
    );
};
