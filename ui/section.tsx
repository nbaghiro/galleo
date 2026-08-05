import type { Component, JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Section, SectionBackground, SectionSummary } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { paint, backdropCss, scaledHostCss } from "@canvas/render/backends";
import { layoutPlaceholder } from "@canvas/render/placeholder";
import {
    measureText,
    layoutSlide,
    layoutSlideSkeleton,
    layoutSection,
    layoutSectionSkeleton,
} from "@canvas/render/commands";
import { slideFrame } from "@engine/profile";

// CSS-scaled to `width`, so it is a true zoomed-out copy (identical wraps), not a re-wrap in a narrow box.

export const ScaledSectionCanvas: Component<{
    section: Section;
    ghost?: SectionSummary; // paint the stand-in for this summary instead of the section
    theme: Tokens;
    profile: FormatDescriptor;
    width?: number;
    frame?: "slide" | "natural";
    layoutWidth?: number; // logical layout width for frame="natural"
    lazy?: boolean;
    rootMargin?: string;
    selected?: boolean;
    as?: "div" | "button";
    onOpen?: (e: MouseEvent) => void;
    title?: string;
    index?: number;
    radius?: number; // card corner radius in px (default theme --radius-lg)
    bordered?: boolean;
    baseShadow?: boolean; // resting drop shadow (combines with the selection ring)
    plain?: boolean; // read-only render: no empty-region drop affordances (default true — this is a scaled copy)
    skeleton?: boolean; // paint the structural ghost instead of the content — a planned section's shape
    class?: string;
}> = (props) => {
    let wrap!: HTMLElement;
    let inner!: HTMLDivElement;
    const [visible, setVisible] = createSignal(!props.lazy);
    const [naturalH, setNaturalH] = createSignal(0);

    const w = (): number => props.width ?? 176;
    const plain = (): boolean => props.plain ?? true;
    const frame = (): "slide" | "natural" => props.frame ?? "slide";
    const slideBox = (): { w: number; h: number } => slideFrame(props.section, props.profile);
    const boxH = (): number =>
        frame() === "slide" ? Math.round((w() * slideBox().h) / slideBox().w) : naturalH();

    createEffect(() => {
        if (!visible()) return;
        if (frame() === "natural") {
            const lw = props.layoutWidth ?? 1120;
            const scale = w() / lw;
            const { commands, height } = props.skeleton
                ? layoutSectionSkeleton(props.section, lw, measureText, props.theme, props.profile)
                : layoutSection(
                      props.section,
                      lw,
                      measureText,
                      props.theme,
                      props.profile,
                      plain(),
                  );
            inner.style.cssText = scaledHostCss(lw, height, scale);
            paint(commands, inner);
            setNaturalH(Math.round(height * scale));
        } else {
            const fr = slideBox();
            const scale = w() / fr.w;
            const ghost = props.ghost;
            const { commands, height } = ghost
                ? layoutPlaceholder(
                      props.section,
                      ghost,
                      fr.w,
                      props.theme,
                      props.profile,
                      fr.w,
                      fr.h,
                  )
                : props.skeleton
                  ? layoutSlideSkeleton(
                        props.section,
                        fr.w,
                        fr.h,
                        measureText,
                        props.theme,
                        props.profile,
                    )
                  : layoutSlide(
                        props.section,
                        fr.w,
                        fr.h,
                        measureText,
                        props.theme,
                        props.profile,
                        plain(),
                    );
            inner.style.cssText = scaledHostCss(fr.w, height, scale);
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
    // ring + resting shadow layered in one box-shadow so the ring isn't clobbered.
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
        // default radius = theme --radius-lg; an explicit `radius` (including 0) wins.
        "border-radius": props.radius !== undefined ? `${props.radius}px` : "var(--radius-lg)",
        ...(props.bordered ? { border: "1px solid var(--color-line)" } : {}),
        ...(boxShadow() ? { "box-shadow": boxShadow() } : {}),
    });
    // A thunk (not stored JSX) so the mounted branch mints its own nodes; refs are assigned once.
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

export const SlideProgress: Component<{ index: number; total: number }> = (props) => (
    <div class="pointer-events-none absolute left-0 top-0 h-0.75 w-full bg-white/10">
        <div
            class="h-full bg-white/70 transition-all"
            style={{ width: `${props.total ? ((props.index + 1) / props.total) * 100 : 0}%` }}
        />
    </div>
);

// paged decks let the slide own the frame (transparent host); doc/web paint the artifact background.
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
