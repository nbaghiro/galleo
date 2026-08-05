import {
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
    type Component,
    createEffect,
} from "solid-js";
import type { Section, ArtifactContent, Cover, SectionSummary } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { resolveTheme, type Tokens } from "@themes";
import { appTheme } from "../stores/theme";
import {
    backdropCss,
    createSectionStackCache,
    paintSectionStack,
    type StackWindow,
} from "@canvas/render/backends";
import { stackWindow, windowMoved } from "@canvas/render/window";
import { SECTION_GAP } from "@canvas/render/commands";
import { placeholderSection } from "@canvas/elements/blueprint";
import { ScaledSectionCanvas } from "@ui/section";

// abstract motion, styled in visuals.css; pass `viz` to pin one (else cycles)
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
            setShown(false);
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

// deliberately not a real render: it stays cheap enough for a list of results
export const ArtifactThumb: Component<{ cover?: Cover; class?: string }> = (props) => {
    const tk = (): Tokens => resolveTheme(appTheme()).tokens;
    return (
        <Show
            when={props.cover?.image}
            fallback={
                <div
                    class={`grid h-full w-full place-items-center ${props.class ?? ""}`}
                    style={{ background: `linear-gradient(150deg, ${tk().surface}, ${tk().bg})` }}
                >
                    <span
                        class="h-1/4 w-1/4 rounded-[25%]"
                        style={{ background: tk().accent, opacity: "0.9" }}
                    />
                </div>
            }
        >
            {(src) => (
                <div
                    class={`h-full w-full ${props.class ?? ""}`}
                    style={{
                        "background-image": `url(${src()})`,
                        "background-size": "cover",
                        "background-position": "center",
                    }}
                />
            )}
        </Show>
    );
};

const DEFAULT_W = 176;

export const MiniCanvas: Component<{
    section: Section;
    themeId: string;
    formatId: string;
    width: number; // final (scaled) width, px
    lazy?: boolean; // defer paint until near view
    class?: string;
}> = (props) => (
    <ScaledSectionCanvas
        section={props.section}
        theme={resolveTheme(props.themeId).tokens}
        profile={resolveProfile(props.formatId)}
        width={props.width}
        frame="slide"
        lazy={props.lazy}
        radius={0}
        class={props.class}
    />
);

// drawn by the engine from a blueprint, so a planned beat's layout and image flag are shown, not described
export const BlueprintThumb: Component<{
    id: string;
    layout: string;
    blocks: string[];
    image: boolean;
    themeId: string;
    formatId: string;
    width?: number;
    class?: string;
}> = (props) => (
    <ScaledSectionCanvas
        section={placeholderSection({
            id: props.id,
            layout: props.layout,
            blocks: props.blocks,
            image: props.image,
        })}
        theme={resolveTheme(props.themeId).tokens}
        profile={resolveProfile(props.formatId)}
        width={props.width ?? 148}
        frame="slide"
        skeleton
        bordered
        class={props.class}
    />
);

export const SectionThumb: Component<{
    section: Section;
    ghost?: SectionSummary; // the digest's summary, painted until the section itself loads
    themeId: string;
    formatId: string;
    label?: string;
    width?: number;
    selected?: boolean;
    onOpen: (e: MouseEvent) => void;
}> = (props) => (
    <ScaledSectionCanvas
        section={props.section}
        ghost={props.ghost}
        theme={resolveTheme(props.themeId).tokens}
        profile={resolveProfile(props.formatId)}
        width={props.width ?? DEFAULT_W}
        frame="slide"
        as="button"
        onOpen={props.onOpen}
        selected={props.selected}
        title={props.label}
        lazy
        rootMargin="500px"
        bordered
        baseShadow
        class="flex-none"
    />
);

// uses natural section heights (not the 16:9 slide frame) so backgrounds show fully
const PAD = 28;

export const PreviewCanvas: Component<{ content: ArtifactContent; format: () => string }> = (
    props,
) => {
    let host!: HTMLDivElement;
    let stage: HTMLDivElement | null = null;
    const cache = createSectionStackCache();
    let lastWindow: StackWindow | null = null;

    const render = (): void => {
        if (!host) return;
        const tk = resolveTheme(props.content.theme).tokens;
        const profile = resolveProfile(props.format());
        const gap = profile.kind === "continuous" ? 0 : SECTION_GAP;
        const fullW = host.clientWidth || 1100;
        host.style.background = backdropCss(props.content.background, tk);
        if (!stage) {
            stage = document.createElement("div");
            host.replaceChildren(stage);
        }
        stage.style.cssText = `position:relative;width:${fullW}px`;
        const viewH = host.clientHeight || 800;
        const win = stackWindow(host.scrollTop, viewH);
        lastWindow = win;
        const { height } = paintSectionStack(stage, props.content.sections, profile, tk, {
            fullW,
            startY: PAD,
            cache,
            window: win,
        });
        stage.style.height = `${height - gap + PAD}px`;
    };

    createEffect(() => {
        props.format();
        void props.content; // track the artifact too: a different one starts a fresh stage
        stage = null;
        cache.entries.clear();
        render();
    });

    const onScroll = (): void => {
        const viewH = host?.clientHeight || 800;
        if (windowMoved(lastWindow, stackWindow(host.scrollTop, viewH), viewH)) render();
    };

    return <div ref={host} class="h-full w-full overflow-y-auto" onScroll={onScroll} />;
};
