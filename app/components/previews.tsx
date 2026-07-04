// Preview/thumbnail components: the generic Visual, the section thumbnail, and the live preview canvas.

import {
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
    type Component,
    createEffect,
} from "solid-js";
import type { Section, ArtifactContent } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes/library";
import { paint, backdropCss, paintSectionStack } from "@studio/canvas/backends";
import { measureText, layoutSlide, SECTION_GAP } from "@studio/canvas/render";

// Themeable abstract motion for the sign-in panel — colored from --color-accent (see visuals.css).
// Cycles through a curated set (crossfading); pass `viz` to pin a single one.
type Viz =
    | "mesh"
    | "aurora"
    | "beam"
    | "spectrum"
    | "waves"
    | "dots"
    | "rays"
    | "pulse"
    | "lattice";
const CYCLE: Viz[] = [
    "mesh",
    "aurora",
    "beam",
    "spectrum",
    "waves",
    "dots",
    "rays",
    "pulse",
    "lattice",
];

const NODES: [number, number][] = [
    [18, 30],
    [40, 17],
    [68, 25],
    [86, 46],
    [30, 60],
    [55, 50],
    [79, 70],
    [22, 82],
    [60, 85],
    [48, 33],
];
const EDGES: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [0, 4],
    [1, 9],
    [9, 5],
    [2, 5],
    [3, 6],
    [4, 5],
    [5, 6],
    [4, 7],
    [5, 8],
    [6, 8],
    [7, 8],
    [9, 2],
];
const LINES = EDGES.map(([a, b]) => ({
    x1: NODES[a]![0],
    y1: NODES[a]![1],
    x2: NODES[b]![0],
    y2: NODES[b]![1],
}));

const Inner: Component<{ viz: Viz }> = (props) => (
    <>
        <Show when={props.viz === "mesh"}>
            <span class="m" />
        </Show>
        <Show when={props.viz === "aurora"}>
            <span class="b b1" />
            <span class="b b2" />
            <span class="b b3" />
        </Show>
        <Show when={props.viz === "beam"}>
            <span class="beam" />
            <span class="beam s2" />
        </Show>
        <Show when={props.viz === "spectrum"}>
            <span class="wheel" />
        </Show>
        <Show when={props.viz === "waves"}>
            <svg viewBox="0 0 400 220" preserveAspectRatio="none">
                <path class="p1" d="M-20,110 C60,70 140,150 220,110 S380,70 460,110" />
                <path class="p2" d="M-20,145 C60,105 140,185 220,145 S380,105 460,145" />
                <path class="p3" d="M-20,75 C60,35 140,115 220,75 S380,35 460,75" />
            </svg>
        </Show>
        <Show when={props.viz === "dots"}>
            <span class="matrix" />
            <span class="spot" />
        </Show>
        <Show when={props.viz === "rays"}>
            <span class="rs" />
        </Show>
        <Show when={props.viz === "pulse"}>
            <span class="core" />
            <span class="ring" />
            <span class="ring r2" />
            <span class="ring r3" />
        </Show>
        <Show when={props.viz === "lattice"}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <For each={LINES}>{(l) => <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />}</For>
                <For each={NODES}>
                    {(p, i) => (
                        <circle
                            cx={p[0]}
                            cy={p[1]}
                            r="1.7"
                            style={{ "animation-delay": `${(-i() * 0.3).toFixed(1)}s` }}
                        />
                    )}
                </For>
            </svg>
        </Show>
    </>
);

export const Visual: Component<{ viz?: Viz }> = (props) => {
    const [i, setI] = createSignal(0);
    const [shown, setShown] = createSignal(true);
    const cur = (): Viz => props.viz ?? CYCLE[i()] ?? "mesh";

    onMount(() => {
        if (props.viz) return; // pinned — no cycling
        const t = window.setInterval(() => {
            setShown(false); // fade out, then swap behind the fade, then fade in
            window.setTimeout(() => {
                setI((v) => (v + 1) % CYCLE.length);
                setShown(true);
            }, 520);
        }, 7000);
        onCleanup(() => window.clearInterval(t));
    });

    return (
        <div
            class={`viz v-${cur()}`}
            style={{
                position: "absolute",
                inset: "0",
                opacity: shown() ? 1 : 0,
                transition: "opacity 0.5s ease",
            }}
        >
            <Inner viz={cur()} />
        </div>
    );
};

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

// Read-only render of an artifact in a chosen format — the SAME continuous canvas the studio editor
// uses (deck = wide cards with gaps, doc = reading column, web = full-bleed bands), at each section's
// natural height. (Present's 16:9 slide framing is intentionally NOT used, so backgrounds show fully.)
const PAD = 28;

export const PreviewCanvas: Component<{ content: ArtifactContent; format: () => string }> = (
    props,
) => {
    let host!: HTMLDivElement;

    const render = (): void => {
        if (!host) return;
        const tk = resolveTheme(props.content.theme).tokens;
        const profile = resolveProfile(props.format());
        const gap = profile.kind === "continuous" ? 0 : SECTION_GAP;
        const fullW = host.clientWidth || 1100;
        host.style.background = backdropCss(props.content.background, tk);
        const stage = document.createElement("div");
        stage.style.cssText = `position:relative;width:${fullW}px`;
        const { height } = paintSectionStack(stage, props.content.sections, profile, tk, {
            fullW,
            startY: PAD,
        });
        stage.style.height = `${height - gap + PAD}px`;
        host.replaceChildren(stage);
    };

    createEffect(() => {
        props.format();
        render();
    });

    return <div ref={host} class="h-full w-full overflow-y-auto" />;
};
