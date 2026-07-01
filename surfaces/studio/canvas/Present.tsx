import type { Section } from "@model/content";
import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { backdropCss } from "./backdrop";
import {
    editor,
    editorTokens,
    exitPresent,
    nextSlide,
    presenting,
    prevSlide,
    setSlideIndex,
    slideIndex,
} from "../editor";
import { measureText } from "./measure";
import { layoutSlide } from "./render";
import { fitSlideContent, paintSectionStack } from "./stage";

// Deck slide geometry (16:9). Each section is stretched to fill the slide.
const SLIDE_W = 1280;
const SLIDE_H = 720;
const MINI_W = 250;

// Full-screen render of the finished artifact, chrome-free, in its target format:
//  · deck → one section per 16:9 slide, keyboard-navigated, with an overview grid ("Present")
//  · doc / web → all sections stacked, scrollable, centered like the studio's doc/web view ("Preview")
export const Present: Component = () => {
    let overlay!: HTMLDivElement;
    let host!: HTMLDivElement;
    const [overview, setOverview] = createSignal(false);
    const theme = createMemo(() => editorTokens());
    const profile = createMemo(() => resolveProfile(editor.artifact.format));
    const paged = createMemo(() => profile().kind === "paged");

    // --- deck: one section → a 1280×720 slide (taller sections scale down to fit) ---
    const buildSlide = (section: Section): HTMLDivElement => {
        const tk = theme();
        const { commands, height } = layoutSlide(
            section,
            SLIDE_W,
            SLIDE_H,
            measureText,
            tk,
            profile(),
        );
        const content = fitSlideContent(commands, height, SLIDE_W, SLIDE_H);
        const slide = document.createElement("div");
        slide.style.cssText = `position:relative;width:${SLIDE_W}px;height:${SLIDE_H}px;overflow:hidden;background:${tk.bg}`;
        slide.appendChild(content);
        return slide;
    };

    const renderCurrent = (): void => {
        if (!host) return;
        const section = editor.artifact.sections[slideIndex()];
        if (!section) return;
        const slide = buildSlide(section);
        const k = Math.min((window.innerWidth - 24) / SLIDE_W, (window.innerHeight - 24) / SLIDE_H);
        slide.style.transform = `scale(${k})`;
        slide.style.transformOrigin = "center center";
        slide.style.borderRadius = "4px";
        host.replaceChildren(slide);
    };

    const renderOverview = (): void => {
        if (!host) return;
        const tk = theme();
        const grid = document.createElement("div");
        grid.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(${MINI_W}px,1fr));gap:18px;padding:48px;width:100%;max-width:1280px;margin:0 auto;align-content:start`;
        const s = MINI_W / SLIDE_W;
        editor.artifact.sections.forEach((section, i) => {
            const slide = buildSlide(section);
            slide.style.transform = `scale(${s})`;
            slide.style.transformOrigin = "top left";
            const cell = document.createElement("button");
            cell.style.cssText = `position:relative;width:${MINI_W}px;height:${SLIDE_H * s}px;overflow:hidden;border-radius:9px;border:2px solid ${i === slideIndex() ? tk.accent : tk.line};cursor:pointer;background:${tk.bg};padding:0`;
            cell.appendChild(slide);
            const num = document.createElement("span");
            num.textContent = String(i + 1);
            num.style.cssText = `position:absolute;left:7px;top:6px;font:600 10px/1 ui-monospace,monospace;color:${tk.muted};background:${tk.surface};border-radius:5px;padding:2px 5px`;
            cell.appendChild(num);
            cell.onclick = () => {
                setSlideIndex(i);
                setOverview(false);
            };
            grid.appendChild(cell);
        });
        host.replaceChildren(grid);
    };

    // --- doc / web: all sections stacked + scrollable, sized like the studio's continuous view ---
    const renderContinuous = (): void => {
        if (!host) return;
        const prof = profile();
        const fullW = host.clientWidth || window.innerWidth;
        const stage = document.createElement("div");
        stage.style.cssText = `position:relative;width:${fullW}px`;
        const { height } = paintSectionStack(stage, editor.artifact.sections, prof, theme(), {
            fullW,
        });
        stage.style.height = `${height}px`;
        host.replaceChildren(stage);
    };

    const render = (): void => {
        if (!paged()) renderContinuous();
        else if (overview()) renderOverview();
        else renderCurrent();
    };

    // Re-render on slide change / overview toggle / format / theme / edit while presenting.
    createEffect(() => {
        if (!presenting()) return;
        overview();
        slideIndex();
        render();
    });

    const toggleFs = (): void => {
        if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
        else overlay?.requestFullscreen?.()?.catch(() => {});
    };

    // Enter fullscreen when presentation starts (the present() click is the user gesture).
    createEffect(() => {
        if (presenting() && !document.fullscreenElement)
            overlay?.requestFullscreen?.()?.catch(() => {});
    });

    onMount(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (!presenting()) return;
            if (paged()) {
                switch (e.key) {
                    case "ArrowRight":
                    case " ":
                    case "ArrowDown":
                        if (!overview()) nextSlide();
                        break;
                    case "ArrowLeft":
                    case "ArrowUp":
                        if (!overview()) prevSlide();
                        break;
                    case "o":
                    case "O":
                        setOverview((v) => !v);
                        break;
                    case "f":
                    case "F":
                        toggleFs();
                        break;
                    case "Escape":
                        if (overview()) setOverview(false);
                        else exitPresent();
                        break;
                }
                return;
            }
            // continuous (doc/web): scroll, fullscreen, exit
            switch (e.key) {
                case " ":
                case "ArrowDown":
                case "PageDown":
                    e.preventDefault();
                    host?.scrollBy({ top: host.clientHeight * 0.9, behavior: "smooth" });
                    break;
                case "ArrowUp":
                case "PageUp":
                    e.preventDefault();
                    host?.scrollBy({ top: -host.clientHeight * 0.9, behavior: "smooth" });
                    break;
                case "f":
                case "F":
                    toggleFs();
                    break;
                case "Escape":
                    exitPresent();
                    break;
            }
        };
        const onResize = (): void => {
            if (presenting()) render();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("resize", onResize);
        onCleanup(() => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onResize);
        });
    });

    const total = (): number => editor.artifact.sections.length;
    const chrome = "rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors";
    const hostStyle = createMemo(
        (): JSX.CSSProperties =>
            paged()
                ? {}
                : {
                      background: backdropCss(editor.artifact.background, theme()),
                      "background-size": "cover",
                      "background-position": "center",
                  },
    );

    return (
        <Show when={presenting()}>
            <div ref={overlay} class="fixed inset-0 z-50 bg-[#0a0a0c]">
                <div
                    ref={host}
                    class={
                        paged()
                            ? "flex h-full w-full items-center justify-center overflow-auto"
                            : "h-full w-full overflow-y-auto"
                    }
                    style={hostStyle()}
                    onClick={() => paged() && !overview() && nextSlide()}
                />

                {/* deck: progress + slide controls */}
                <Show when={paged()}>
                    <div class="pointer-events-none absolute left-0 top-0 h-[3px] w-full bg-white/10">
                        <div
                            class="h-full bg-white/70 transition-all"
                            style={{
                                width: `${total() ? ((slideIndex() + 1) / total()) * 100 : 0}%`,
                            }}
                        />
                    </div>
                    <div
                        class="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-black/55 px-2 py-1.5 text-white/80 backdrop-blur-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            class={`${chrome} hover:bg-white/10`}
                            title="Previous (←)"
                            onClick={() => prevSlide()}
                        >
                            ‹
                        </button>
                        <span class="px-1.5 font-mono text-[12px] tabular-nums">
                            {slideIndex() + 1} / {total()}
                        </span>
                        <button
                            class={`${chrome} hover:bg-white/10`}
                            title="Next (→)"
                            onClick={() => nextSlide()}
                        >
                            ›
                        </button>
                        <span class="mx-1 h-4 w-px bg-white/15" />
                        <button
                            class={`${chrome} ${overview() ? "bg-white/15" : "hover:bg-white/10"}`}
                            title="Overview (O)"
                            onClick={() => setOverview((v) => !v)}
                        >
                            Grid
                        </button>
                        <button
                            class={`${chrome} hover:bg-white/10`}
                            title="Fullscreen (F)"
                            onClick={toggleFs}
                        >
                            ⤢
                        </button>
                        <button
                            class={`${chrome} hover:bg-white/10`}
                            title="Exit (Esc)"
                            onClick={() => exitPresent()}
                        >
                            ✕
                        </button>
                    </div>
                </Show>

                {/* doc / web: minimal floating controls */}
                <Show when={!paged()}>
                    <div class="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-black/55 px-2 py-1.5 text-white/80 backdrop-blur-md">
                        <span class="px-1.5 text-[11px] uppercase tracking-wider text-white/55">
                            Preview
                        </span>
                        <span class="mx-1 h-4 w-px bg-white/15" />
                        <button
                            class={`${chrome} hover:bg-white/10`}
                            title="Fullscreen (F)"
                            onClick={toggleFs}
                        >
                            ⤢
                        </button>
                        <button
                            class={`${chrome} hover:bg-white/10`}
                            title="Exit (Esc)"
                            onClick={() => exitPresent()}
                        >
                            ✕
                        </button>
                    </div>
                </Show>
            </div>
        </Show>
    );
};
