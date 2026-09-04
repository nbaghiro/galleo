import type { Component, JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Section, SectionBackground, SectionSummary } from "@model/artifact";
import type { RenderCommand } from "@engine/node";
import type { FormatDescriptor } from "@model/geometry";
import type { Tokens } from "@themes";
import { paint, backdropCss, scaledHostCss } from "@canvas/render/backends";
import { layoutPlaceholder } from "@canvas/render/placeholder";
import { fitIntoBox, fitSectionToFrame, thumbFrame } from "@canvas/render/fit";
import { fontsGeneration } from "./fonts";
import {
    measureText,
    layoutSlide,
    layoutSlideSkeleton,
    layoutSection,
    layoutSectionSkeleton,
} from "@canvas/render/commands";

// CSS-scaled to `width`, so it is a true zoomed-out copy (identical wraps), not a re-wrap in a narrow box.

export const ScaledSectionCanvas: Component<{
    section: Section;
    ghost?: SectionSummary; // paint the stand-in for this summary instead of the section
    theme: Tokens;
    profile: FormatDescriptor;
    width?: number;
    frame?: "slide" | "natural";
    // Tile box aspect (w/h). A tile is a picture of the section, not a viewport onto it: the section
    // is re-framed to this shape at the one layout width every tile shares (`thumbFrame`) and scaled
    // to FILL the box, cropping the tail rather than sitting inside bars. Ignored by frame="natural",
    // which has no box.
    tile?: number;
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
    const tile = (): number | undefined =>
        props.tile && props.tile > 0 && frame() === "slide" ? props.tile : undefined;
    const slideBox = (): { w: number; h: number } =>
        thumbFrame(props.section, props.profile, tile());
    const boxH = (): number => {
        if (frame() !== "slide") return naturalH();
        const a = tile();
        return a ? Math.round(w() / a) : Math.round((w() * slideBox().h) / slideBox().w);
    };

    createEffect(() => {
        if (!visible()) return;
        fontsGeneration(); // re-solve once the real faces land: this canvas holds no layer cache
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
            paint(commands, inner, "thumb");
            setNaturalH(Math.round(height * scale));
        } else {
            const fr = slideBox();
            const ghost = props.ghost;
            // Three cases. A frame that is canonical — a PAGED format's page, a hero's authored band,
            // or the one every TILE shares — is rendered as its own page: short content centres in it
            // and tall content fits rather than paginating, because a thumbnail shows the whole
            // section. A CONTINUOUS format asked for a free-standing preview has no page shape at all,
            // so solve for the width at which the content BECOMES this card's shape
            // (@canvas/render/fit) instead of scaling its natural layout down into bars.
            // Stand-ins keep the frame width: there is nothing to reflow in a placeholder or skeleton.
            let commands: RenderCommand[];
            let layoutW = fr.w;
            let contentH = fr.h;
            if (ghost) {
                const r = layoutPlaceholder(
                    props.section,
                    ghost,
                    fr.w,
                    props.theme,
                    props.profile,
                    fr.w,
                    fr.h,
                );
                commands = r.commands;
                contentH = r.height;
            } else if (props.skeleton) {
                const r = layoutSlideSkeleton(
                    props.section,
                    fr.w,
                    fr.h,
                    measureText,
                    props.theme,
                    props.profile,
                );
                commands = r.commands;
                contentH = r.height;
            } else if (tile() || props.profile.kind === "paged" || props.section.frame?.aspect) {
                // A banded continuous section (a hero) has a canonical shape by authorship, exactly
                // like a paged card, and a tile hands every section one. Width-solving a tile would
                // undo what the shared frame is for: it lands a doc card on a few hundred px and the
                // same authored type then paints two or three times the size of the deck card beside
                // it. `layoutSlide` and not `sectionSlides`, so the page is the frame THIS canvas
                // draws into rather than the section's own.
                const page = layoutSlide(
                    props.section,
                    fr.w,
                    fr.h,
                    measureText,
                    props.theme,
                    { ...props.profile, overflow: "fit" },
                    plain(),
                );
                commands = page.commands;
                contentH = page.height;
            } else {
                const r = fitSectionToFrame(
                    props.section,
                    fr,
                    measureText,
                    props.theme,
                    props.profile,
                    plain(),
                );
                commands = r.commands;
                layoutW = r.layoutW;
                contentH = r.contentH;
            }
            // Contain fits both axes: exactly filling when the solver found the shape, letterboxed
            // when the content could not take it (a lone photo). A tile covers instead, so the box
            // is always full and whatever hangs past it is clipped by the wrapper.
            const { scale, left, top } = fitIntoBox(
                { w: w(), h: boxH() },
                { w: layoutW, h: contentH },
                tile() ? "cover" : "contain",
            );
            paint(commands, inner, "thumb"); // paint first — it forces position:relative
            inner.style.cssText =
                `position:absolute;width:${layoutW}px;height:${contentH}px;` +
                `transform:scale(${scale});transform-origin:top left;` +
                `left:${left}px;top:${top}px`;
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
