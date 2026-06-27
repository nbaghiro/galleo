import type { Section } from "@model/content";
import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes/library";
import { paint } from "./dom-backend";
import { editor, exitPresent, nextSlide, presenting, prevSlide, setSlideIndex, slideIndex } from "./editor";
import { measureText } from "./measure";
import { layoutSlide } from "./render";

// Deck slide geometry (16:9). Each section is stretched to fill the slide.
const SLIDE_W = 1280;
const SLIDE_H = 720;
const MINI_W = 250;

// Fullscreen presentation: one section per 16:9 slide, fit-to-screen, with an overview grid.
export const Present: Component = () => {
    let overlay!: HTMLDivElement;
    let host!: HTMLDivElement;
    const [overview, setOverview] = createSignal(false);
    const theme = createMemo(() => resolveTheme(editor.artifact.theme).tokens);
    const deck = createMemo(() => resolveProfile("deck"));

    // One section → a 1280×720 slide: the section fills the frame (taller sections scale down to fit).
    const buildSlide = (section: Section): HTMLDivElement => {
        const tk = theme();
        const { commands, height } = layoutSlide(section, SLIDE_W, SLIDE_H, measureText, tk, deck());
        const fit = Math.min(1, SLIDE_H / height);
        const content = document.createElement("div");
        content.style.cssText = `position:absolute;width:${SLIDE_W}px;height:${height}px;transform:scale(${fit});transform-origin:top left;left:${(SLIDE_W - SLIDE_W * fit) / 2}px;top:${(SLIDE_H - height * fit) / 2}px`;
        paint(commands, content);
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

    // Re-render on slide change / edit / theme / overview toggle while presenting.
    createEffect(() => {
        if (!presenting()) return;
        if (overview()) renderOverview();
        else renderCurrent();
    });

    const toggleFs = (): void => {
        if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {});
        else void overlay?.requestFullscreen?.()?.catch(() => {});
    };

    // Enter fullscreen when presentation starts (the present() click is the user gesture).
    createEffect(() => {
        if (presenting() && !document.fullscreenElement) void overlay?.requestFullscreen?.()?.catch(() => {});
    });

    onMount(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (!presenting()) return;
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
        };
        const onResize = (): void => {
            if (presenting() && !overview()) renderCurrent();
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

    return (
        <Show when={presenting()}>
            <div ref={overlay} class="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0c]">
                <div
                    ref={host}
                    class="flex h-full w-full items-center justify-center overflow-auto"
                    onClick={() => !overview() && nextSlide()}
                />

                {/* progress bar */}
                <div class="pointer-events-none absolute left-0 top-0 h-[3px] w-full bg-white/10">
                    <div class="h-full bg-white/70 transition-all" style={{ width: `${total() ? ((slideIndex() + 1) / total()) * 100 : 0}%` }} />
                </div>

                {/* controls */}
                <div
                    class="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-black/55 px-2 py-1.5 text-white/80 backdrop-blur-md"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button class={`${chrome} hover:bg-white/10`} title="Previous (←)" onClick={() => prevSlide()}>‹</button>
                    <span class="px-1.5 font-mono text-[12px] tabular-nums">{slideIndex() + 1} / {total()}</span>
                    <button class={`${chrome} hover:bg-white/10`} title="Next (→)" onClick={() => nextSlide()}>›</button>
                    <span class="mx-1 h-4 w-px bg-white/15" />
                    <button class={`${chrome} ${overview() ? "bg-white/15" : "hover:bg-white/10"}`} title="Overview (O)" onClick={() => setOverview((v) => !v)}>Grid</button>
                    <button class={`${chrome} hover:bg-white/10`} title="Fullscreen (F)" onClick={toggleFs}>⤢</button>
                    <button class={`${chrome} hover:bg-white/10`} title="Exit (Esc)" onClick={() => exitPresent()}>✕</button>
                </div>
            </div>
        </Show>
    );
};
