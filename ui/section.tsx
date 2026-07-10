import type { Component, JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Section, SectionBackground } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { paint, backdropCss } from "@canvas/render/backends";
import { measureText, layoutSlide, layoutSection } from "@canvas/render/commands";
import { scaledHostCss } from "@canvas/render/geometry";

// A real engine render of one Section, painted at a logical width then CSS-scaled to `width` — a true
// zoomed-out copy (identical text wraps), not a re-wrap in a narrow box. Unifies the four former
// thumbnails (MiniCanvas · SectionThumb · StoryTile · Thumb). `frame="slide"` fits a uniform 16:9 card
// (filmstrips/decks); `frame="natural"` keeps the section's own height (the minimap rail).
const SLIDE_LW = 1280;
const SLIDE_SH = 720;

export const ScaledSectionCanvas: Component<{
    section: Section;
    theme: Tokens;
    profile: FormatDescriptor;
    width?: number;
    frame?: "slide" | "natural";
    layoutWidth?: number; // logical layout width for frame="natural" (default 1120)
    lazy?: boolean;
    rootMargin?: string;
    selected?: boolean;
    as?: "div" | "button";
    onOpen?: (e: MouseEvent) => void;
    title?: string;
    index?: number;
    radius?: number; // card corner radius in px (default: theme `--radius-lg`, 8px at the neutral theme)
    bordered?: boolean; // 1px theme-line border
    baseShadow?: boolean; // subtle resting drop shadow (combines with the selection ring)
    class?: string;
}> = (props) => {
    let wrap!: HTMLElement;
    let inner!: HTMLDivElement;
    const [visible, setVisible] = createSignal(!props.lazy);
    const [naturalH, setNaturalH] = createSignal(0);

    const w = (): number => props.width ?? 176;
    const frame = (): "slide" | "natural" => props.frame ?? "slide";
    const boxH = (): number => (frame() === "slide" ? Math.round((w() * 9) / 16) : naturalH());

    createEffect(() => {
        if (!visible()) return;
        if (frame() === "natural") {
            const lw = props.layoutWidth ?? 1120;
            const scale = w() / lw;
            const { commands, height } = layoutSection(
                props.section,
                lw,
                measureText,
                props.theme,
                props.profile,
            );
            inner.style.cssText = scaledHostCss(lw, height, scale);
            paint(commands, inner);
            setNaturalH(Math.round(height * scale));
        } else {
            const scale = w() / SLIDE_LW;
            const { commands, height } = layoutSlide(
                props.section,
                SLIDE_LW,
                SLIDE_SH,
                measureText,
                props.theme,
                props.profile,
            );
            inner.style.cssText = scaledHostCss(SLIDE_LW, height, scale);
            paint(commands, inner);
        }
    });

    onMount(() => {
        if (!props.lazy) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setVisible(true);
                    io.disconnect();
                }
            },
            { rootMargin: props.rootMargin ?? "400px" },
        );
        io.observe(wrap);
        onCleanup(() => io.disconnect());
    });

    const wrapCls = (): string =>
        `relative block overflow-hidden ${props.as === "button" ? "cursor-pointer" : ""} ${props.class ?? ""}`;
    // Selection ring + optional resting shadow, layered in one box-shadow so the ring isn't clobbered.
    const boxShadow = (): string | undefined => {
        const parts = [
            props.selected ? "0 0 0 2px var(--color-accent)" : "",
            props.baseShadow ? "0 1px 2px rgba(0,0,0,0.05)" : "",
        ].filter(Boolean);
        return parts.length ? parts.join(", ") : undefined;
    };
    const wrapStyle = (): JSX.CSSProperties => ({
        width: `${w()}px`,
        height: `${boxH()}px`,
        background: props.theme.bg,
        // No explicit radius → the theme-derived card radius (`--radius-lg`, = 8px at the neutral theme,
        // so no change there) so filmstrip/library tiles round in step with the rest of the chrome and
        // their own `rounded-lg` skeletons. An explicit `radius` (incl. 0 for a bleed mini-canvas) wins.
        "border-radius": props.radius !== undefined ? `${props.radius}px` : "var(--radius-lg)",
        ...(props.bordered ? { border: "1px solid var(--color-line)" } : {}),
        ...(boxShadow() ? { "box-shadow": boxShadow() } : {}),
    });
    // A thunk (not stored JSX), so the one mounted branch mints its own nodes — the `inner`/`wrap` refs
    // are assigned exactly once.
    const body = (): JSX.Element => (
        <>
            <div ref={inner} />
            <Show when={props.index !== undefined}>
                <span class="absolute left-1.5 top-1.5 rounded bg-panel/85 px-1 py-0.5 font-mono text-[9px] font-semibold text-muted">
                    {(props.index ?? 0) + 1}
                </span>
            </Show>
        </>
    );

    return (
        <Show
            when={props.as === "button"}
            fallback={
                <div ref={(el) => (wrap = el)} class={wrapCls()} style={wrapStyle()}>
                    {body()}
                </div>
            }
        >
            <button
                ref={(el) => (wrap = el)}
                onClick={props.onOpen}
                title={props.title}
                class={wrapCls()}
                style={wrapStyle()}
            >
                {body()}
            </button>
        </Show>
    );
};

// The deck progress strip (present surfaces).
export const SlideProgress: Component<{ index: number; total: number }> = (props) => (
    <div class="pointer-events-none absolute left-0 top-0 h-[3px] w-full bg-white/10">
        <div
            class="h-full bg-white/70 transition-all"
            style={{ width: `${props.total ? ((props.index + 1) / props.total) * 100 : 0}%` }}
        />
    </div>
);

// The present host's backdrop style — paged decks let the slide own the frame (transparent host); doc/web
// paint the artifact background across the scroll host.
export function backdropHostStyle(
    paged: boolean,
    background: SectionBackground | undefined,
    tokens: Tokens,
): JSX.CSSProperties {
    if (paged) return {};
    return {
        background: backdropCss(background, tokens),
        "background-size": "cover",
        "background-position": "center",
    };
}
