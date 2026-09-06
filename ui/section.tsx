import type { Component, JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { ArtifactContent, Section, SectionBackground, SectionSummary } from "@model/artifact";
import type { RenderCommand } from "@engine/node";
import type { FormatDescriptor } from "@model/geometry";
import { profileFor } from "@engine/profile";
import { resolveTheme } from "@themes";
import type { Tokens } from "@themes";
import {
    paint,
    backdropCss,
    createSectionStackCache,
    paintSectionStack,
    scaledHostCss,
} from "@canvas/render/backends";
import { layoutPlaceholder } from "@canvas/render/placeholder";
import { fitIntoBox, fitSectionToFrame, thumbFrame } from "@canvas/render/fit";
import { createFontsInvalidator, fontsGeneration } from "./fonts";
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

/**
 * How wide to draw a plate of a given format inside a box of a given width.
 *
 * Tuned drawing widths rather than the profiles' page widths: the editor lays a doc's column out at
 * maxContentWidth (1000), reached once fullW hits 1064, and passing the 816 page width instead
 * rendered it at 752 and read too narrow.
 *
 * Normalising against the widest is what makes the formats tell themselves apart in an identical
 * box: a site runs to the edges, a deck sits slightly inside them, and a doc sits on noticeably more
 * backdrop. That difference is the thing a reader sees before they read the label, which is why it
 * lives here with the plate rather than in whichever surface happened to need it first.
 */
const CARD_LAYOUT_W: Record<string, number> = { deck: 1280, doc: 1064, web: 1440 };
const CARD_WIDEST = Math.max(...Object.values(CARD_LAYOUT_W));

/** Head margin so a page clears its card edge the way it clears the editor's top padding. */
export const PLATE_PAD_TOP = 14;

/**
 * `padTop` is part of the same rule, not a caller's choice: a deck and a doc are pages and clear
 * the edge, and a site has no page margin to clear, so it starts at the edge and runs to it. The
 * profile already knows which is which through `bleedSections`, so nothing here is a list of
 * formats that would need editing when a fourth one arrives.
 */
export function plateGeometry(
    format: string,
    boxWidth: number,
    headMargin = PLATE_PAD_TOP,
): { width: number; layoutWidth: number; padTop: number } {
    const layoutWidth = CARD_LAYOUT_W[format] ?? CARD_LAYOUT_W.deck!;
    const bleeds = profileFor({ format }).bleedSections === true;
    return {
        width: Math.round(layoutWidth * (boxWidth / CARD_WIDEST)),
        layoutWidth,
        padTop: bleeds ? 0 : headMargin,
    };
}

/**
 * A whole artifact drawn as a scaled, read-only copy of itself: the section stack over the
 * artifact's own backdrop, at the format's own layout width.
 *
 * Lives here rather than in app/ because four places want it and only one of them could have it.
 * The library cards, the onboarding previews and the editor's scaled copies went through app's
 * copy; the marketing site could not reach it at all, since the layering law stops website at @ui,
 * and widget/main.ts hand-rolls the same three calls because it is framework-free by rule and can
 * never import this. Moving it down leaves widget as the only duplicate, and that one is load-bearing.
 *
 * The two things a bare paintSectionStack drops, and the reason this composition has to exist:
 * `content.background` belongs to the whole piece rather than to a section, and a transform does
 * not change layout, so the drawn height has to be stated or a scrolling host measures an extent
 * several times longer than what a reader sees.
 */
export const ArtifactPlate: Component<{
    content: ArtifactContent;
    themeId: string;
    width: number; // drawn width, px
    layoutWidth: number; // the format's own layout width, so wraps match the real thing
    depth?: number; // sections painted before the crop takes over
    // drawn px of head margin, so the first section clears the card edge the way it clears the
    // editor's own top padding; the backdrop still fills the card behind it
    padTop?: number;
    /** Let the plate's box scroll its own stack. Off by default: a plate is normally a crop. */
    scroll?: boolean;
}> = (props) => {
    let host!: HTMLDivElement;
    let sizer!: HTMLDivElement;
    let inner!: HTMLDivElement;
    // one cache for the life of the plate: a re-run with a deeper stack then reuses the layers it
    // already laid out instead of paying for the whole thing again
    const cache = createSectionStackCache();
    const fontsSettled = createFontsInvalidator(cache);

    createEffect(() => {
        fontsSettled();
        const tk = resolveTheme(props.themeId).tokens;
        const profile = profileFor(props.content);
        const sections = props.content.sections.slice(0, props.depth ?? 6);
        // paint first: the stack painter lays out and paints in one pass, and its layers are
        // absolutely positioned, so scaling the host afterwards is safe
        const { height } = paintSectionStack(inner, sections, profile, tk, {
            fullW: props.layoutWidth,
            cache,
            assets: "thumb", // a plate is a picture of the artifact, drawn at card size
        });
        const scale = props.width / props.layoutWidth;
        inner.style.cssText = scaledHostCss(props.layoutWidth, height, scale);
        // A transform does not change layout, so the scaled stack still occupies its full unscaled
        // height. Stating the drawn height here is what lets a scrolling host measure the extent a
        // reader actually sees rather than one several times too long. The head margin is part of
        // that extent: box-sizing is border-box, so leaving it out clips the foot of the artifact
        // by exactly the margin at the head.
        sizer.style.height = `${Math.round(height * scale) + (props.padTop ?? 0)}px`;
        host.style.background = backdropCss(props.content.background, tk);
        host.style.backgroundSize = "cover";
        host.style.backgroundPosition = "center";
    });

    // The backdrop fills the host edge to edge and the stack sits centred on it at its own layout
    // width, which is exactly how the editor canvas reads: a narrow doc column shows more backdrop
    // either side than a full-bleed site does, and that difference IS the format's proportion.
    return (
        <div
            ref={host}
            data-testid="plate"
            class={`relative h-full w-full ${
                props.scroll
                    ? // contain, so reaching the end of the plate does not hand the wheel back to
                      // the page mid-gesture; the scrollbar is left off because the plate is a picture
                      "overflow-y-auto overscroll-contain [scrollbar-width:none]"
                    : "overflow-hidden"
            }`}
        >
            <div
                ref={sizer}
                class="mx-auto overflow-hidden"
                style={{ width: `${props.width}px`, "padding-top": `${props.padTop ?? 0}px` }}
            >
                <div ref={inner} />
            </div>
        </div>
    );
};
