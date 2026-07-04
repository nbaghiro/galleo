import type { Section } from "@model/artifact";
import type { Component } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes/library";
import { paint } from "@studio/canvas/dom-backend";
import { measureText } from "@studio/canvas/measure";
import { layoutSlide } from "@studio/canvas/render";

// Real engine-rendered preview of one section, in the artifact's true format + theme — the exact
// layout/text/images. Every section uses one uniform 16:9 frame (deck/doc/site alike) so the
// filmstrip stays aligned; the format still drives how the content composes, just not the card shape.
// Rendering is lazy (only when scrolled near view) so a library of many artifacts × sections stays fast.
const LW = 1280; // layout width, then scaled to the card
const SH = 720; // 16:9 slide frame
const DEFAULT_W = 176; // default card width

export const SectionThumb: Component<{
    section: Section;
    themeId: string;
    formatId: string;
    label?: string;
    width?: number;
    selected?: boolean;
    onOpen: (e: MouseEvent) => void;
}> = (props) => {
    let wrap!: HTMLButtonElement;
    let inner!: HTMLDivElement;
    const cw = (): number => props.width ?? DEFAULT_W;
    const ch = (): number => Math.round((cw() * 9) / 16);

    // Lazy: paint only once scrolled near view. Then re-paints reactively if the theme / section /
    // format changes (e.g. switching the app theme while previews are on screen) — paint() clears the
    // host first, so a re-render simply replaces the content.
    const [visible, setVisible] = createSignal(false);
    const render = (): void => {
        if (!visible()) return;
        const theme = resolveTheme(props.themeId).tokens;
        const format = resolveProfile(props.formatId);
        const { commands, height } = layoutSlide(props.section, LW, SH, measureText, theme, format);
        inner.style.cssText = `width:${LW}px;height:${height}px;transform:scale(${cw() / LW});transform-origin:top left`;
        paint(commands, inner);
    };
    createEffect(render);

    onMount(() => {
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setVisible(true);
                    io.disconnect();
                }
            },
            { rootMargin: "500px" },
        );
        io.observe(wrap);
        onCleanup(() => io.disconnect());
    });

    return (
        <button
            ref={wrap}
            onClick={props.onOpen}
            title={props.label}
            class="relative flex-none cursor-pointer overflow-hidden rounded-lg"
            style={{
                width: `${cw()}px`,
                height: `${ch()}px`,
                background: resolveTheme(props.themeId).tokens.bg,
                // ring lives in the inline box-shadow so it isn't overridden by the base shadow below
                "box-shadow": props.selected
                    ? "0 0 0 2px var(--color-accent), 0 1px 2px rgba(0,0,0,0.05)"
                    : "0 1px 2px rgba(0,0,0,0.05)",
                border: "1px solid var(--color-line)",
            }}
        >
            <div ref={inner} />
        </button>
    );
};
