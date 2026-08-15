import {
    createSignal,
    For,
    on,
    onCleanup,
    onMount,
    Show,
    type Component,
    createEffect,
} from "solid-js";
import type { Section, ArtifactContent, Cover, PageSize, SectionSummary } from "@model/artifact";
import { sectionRegionId } from "@model/artifact";
import type { Rect } from "@engine/node";
import { profileFor } from "@engine/profile";
import { resolveTheme, type Tokens } from "@themes";
import { appTheme } from "@app/stores/theme";
import {
    backdropCss,
    createSectionStackCache,
    paintSectionStack,
    type StackWindow,
} from "@canvas/render/backends";
import { stackWindow, windowMoved } from "@canvas/render/window";
import { SECTION_GAP } from "@canvas/render/commands";
import { ScaledSectionCanvas } from "@ui/section";
import { StatusDot } from "@ui/status";

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
    page?: PageSize;
    width: number; // final (scaled) width, px
    lazy?: boolean; // defer paint until near view
    class?: string;
}> = (props) => (
    <ScaledSectionCanvas
        section={props.section}
        theme={resolveTheme(props.themeId).tokens}
        profile={profileFor({ format: props.formatId, page: props.page })}
        width={props.width}
        frame="slide"
        lazy={props.lazy}
        radius={0}
        class={props.class}
    />
);

export const SectionThumb: Component<{
    section: Section;
    ghost?: SectionSummary; // the digest's summary, painted until the section itself loads
    themeId: string;
    formatId: string;
    page?: PageSize;
    label?: string;
    width?: number;
    selected?: boolean;
    onOpen: (e: MouseEvent) => void;
}> = (props) => (
    <ScaledSectionCanvas
        section={props.section}
        ghost={props.ghost}
        theme={resolveTheme(props.themeId).tokens}
        profile={profileFor({ format: props.formatId, page: props.page })}
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
// a section becomes the active one once its top crosses this far down the viewport
const ANCHOR = 0.3;
// smooth scrolling has no completion event, so the spy un-mutes on arrival or on this timeout
const SETTLE_MS = 700;

export const PreviewCanvas: Component<{
    content: ArtifactContent;
    format: () => string;
    /**
     * Overrides the artifact's own theme. Pass the app's when the preview sits inside our chrome
     * rather than standing in for the artifact, the way the list's SectionThumbs already do: two
     * palettes in one pane read as a bug. Defaults to the artifact's, which is right when the
     * preview IS the artifact (a template card, a shared piece).
     */
    themeId?: string;
    // Optional selection layer. The stack painter already returns each section's top and height, so
    // hit areas, the scroll-into-view and the corner marks all read those rather than measuring
    // anything themselves.
    selected?: string;
    onSelect?: (id: string) => void;
    /** Scrolling reports the section now being read, so a caller's list can follow the view. */
    onActive?: (id: string) => void;
    mark?: (id: string) => "fail" | "warn" | null;
}> = (props) => {
    let host!: HTMLDivElement;
    let paintHost!: HTMLDivElement;
    let stage: HTMLDivElement | null = null;
    const cache = createSectionStackCache();
    let lastWindow: StackWindow | null = null;
    // `top`/`height` are the section's band in the stack and exist for every section, which is what
    // the scroll spy reads. `card` is the painted card inside that band, which is narrower than the
    // pane whenever the format centres its page, and is what selection outlines. It comes from the
    // painter's own regions (the same ones the editor selects with), so it carries the radius the
    // card actually painted and is absent for a section the window has not painted.
    const [boxes, setBoxes] = createSignal<
        { id: string; top: number; height: number; card: Rect & { radius: number } }[]
    >([]);
    // Two guards keep scrolling and selection from driving each other in a loop: `settleTo` mutes
    // the spy while our own scroll is in flight, and `reported` stops the follow-effect from
    // re-centring a selection the spy itself just produced.
    let settleTo: number | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let reported: string | null = null;

    const render = (): void => {
        if (!host) return;
        const tk = resolveTheme(props.themeId ?? props.content.theme).tokens;
        // props.format may preview the content as a different format; its own page size still applies
        const profile = profileFor({ format: props.format(), page: props.content.page });
        const gap = profile.kind === "continuous" ? 0 : SECTION_GAP;
        const fullW = host.clientWidth || 1100;
        host.style.background = backdropCss(props.content.background, tk);
        if (!stage) {
            stage = document.createElement("div");
            paintHost.replaceChildren(stage);
        }
        stage.style.cssText = `position:relative;width:${fullW}px`;
        const viewH = host.clientHeight || 800;
        const win = stackWindow(host.scrollTop, viewH);
        lastWindow = win;
        const { height, tops, heights, regions } = paintSectionStack(
            stage,
            props.content.sections,
            profile,
            tk,
            { fullW, startY: PAD, cache, window: win },
        );
        stage.style.height = `${height - gap + PAD}px`;
        setBoxes(
            props.content.sections.map((s, i) => {
                const top = tops[i] ?? 0;
                const h = heights[i] ?? 0;
                const region = regions.find((r) => r.id === sectionRegionId(s.id));
                return {
                    id: s.id,
                    top,
                    height: h,
                    card: region
                        ? { ...region.box, radius: region.radius ?? 0 }
                        : { x: 0, y: top, w: fullW, h, radius: 0 },
                };
            }),
        );
    };

    createEffect(() => {
        props.format();
        void props.themeId; // a theme switch repaints from scratch, like a format change
        void props.content; // track the artifact too: a different one starts a fresh stage
        stage = null;
        cache.entries.clear();
        render();
    });

    const activeAt = (): string | undefined => {
        const bs = boxes();
        const first = bs[0];
        if (!first) return undefined;
        // the last section can be too short to reach the anchor, so the end of the scroll is its cue
        if (host.scrollTop + host.clientHeight >= host.scrollHeight - 4)
            return bs[bs.length - 1]?.id;
        const line = host.scrollTop + host.clientHeight * ANCHOR;
        let hit = first.id;
        for (const b of bs) if (b.top <= line) hit = b.id;
        return hit;
    };

    const onScroll = (): void => {
        const viewH = host?.clientHeight || 800;
        if (windowMoved(lastWindow, stackWindow(host.scrollTop, viewH), viewH)) render();
        if (settleTo !== null) {
            if (Math.abs(host.scrollTop - settleTo) > 4) return;
            settleTo = null;
        }
        const id = activeAt();
        if (id && id !== props.selected) {
            reported = id;
            props.onActive?.(id);
        }
    };

    // follow the caller's selection, using the painter's own offsets rather than a DOM query.
    // `on` keeps this off boxes(), which a windowed repaint rewrites mid-scroll.
    createEffect(
        on(
            () => props.selected,
            (id) => {
                if (!id || !host || id === reported) return;
                const box = boxes().find((b) => b.id === id);
                if (!box) return;
                reported = null; // this selection came from outside, so the spy's last word is stale
                const top = Math.max(0, box.top - PAD);
                settleTo = top;
                clearTimeout(settleTimer);
                settleTimer = setTimeout(() => (settleTo = null), SETTLE_MS);
                host.scrollTo({ top, behavior: "smooth" });
            },
        ),
    );
    onCleanup(() => clearTimeout(settleTimer));

    return (
        <div ref={host} class="relative h-full w-full overflow-y-auto" onScroll={onScroll}>
            <div ref={paintHost} />
            <Show when={props.onSelect || props.mark}>
                <div class="pointer-events-none absolute inset-0">
                    <For each={boxes()}>
                        {(b) => {
                            const tone = (): "fail" | "warn" | null => props.mark?.(b.id) ?? null;
                            const active = (): boolean => props.selected === b.id;
                            return (
                                // the painted card, not the full-width band: a centred format leaves
                                // backdrop either side, and an outline out there frames nothing
                                <div
                                    class="absolute"
                                    style={{
                                        left: `${b.card.x}px`,
                                        top: `${b.card.y}px`,
                                        width: `${b.card.w}px`,
                                        height: `${b.card.h}px`,
                                    }}
                                >
                                    {/* a border, not a ring: a ring draws outside the box, so at the
                                        pane's edge its outer edges fall outside the scroll clip */}
                                    <Show when={active()}>
                                        <div
                                            class="absolute inset-0 border-2 border-accent"
                                            style={{ "border-radius": `${b.card.radius}px` }}
                                        />
                                    </Show>
                                    {/* the dot, not the section body, is the hit area: the preview
                                        stays scrollable and its text selectable */}
                                    <Show when={props.onSelect}>
                                        <button
                                            type="button"
                                            class="pointer-events-auto absolute top-1.5 right-1.5 grid size-7 place-items-center"
                                            title={`Inspect ${b.id}`}
                                            onClick={() => props.onSelect?.(b.id)}
                                        >
                                            <StatusDot
                                                tone={
                                                    tone() === "fail"
                                                        ? "fail"
                                                        : tone() === "warn"
                                                          ? "accent"
                                                          : "line"
                                                }
                                                size={active() ? 11 : 8}
                                                class="ring-2 ring-panel transition-all"
                                            />
                                        </button>
                                    </Show>
                                </div>
                            );
                        }}
                    </For>
                </div>
            </Show>
        </div>
    );
};
