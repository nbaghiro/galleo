import type { ArtifactContent } from "@model/artifact";
import type { Soundtrack, WorkspaceBed } from "@model/speech";
import type { FormatDescriptor } from "@model/geometry";
import type { Region } from "@engine/node";
import { MUSIC_VOLUME, parseTarget, scriptStale, sectionLinkId } from "@model/artifact";
import { seedViewerPatches, viewerToggleAt, withViewerPatches } from "@elements/ops";
import type { Component, JSX } from "solid-js";
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    on,
    onCleanup,
    onMount,
    Show,
    untrack,
} from "solid-js";
import { previewContentProfile, profileFor, sectionFrame } from "@engine/profile";
import { motionFor, resolveTheme } from "@themes";
import {
    createSectionStackCache,
    paintSectionStack,
    PINNED_Z,
    type SectionLayer,
    type StackWindow,
} from "@canvas/render/backends";
import { stackWindow, windowMoved } from "@canvas/render/window";
import {
    continuousSteps,
    firstSlideOf,
    locateSlide,
    pagedSteps,
    pinnedShift,
    sectionScrollTop,
    sectionSlideCount,
    slideElement,
    type Step,
    stepHoldMs,
} from "@canvas/render/present";
import { Portal } from "solid-js/web";
import { createFontsInvalidator } from "./fonts";
import { LiveLayer } from "./live";
import { backdropHostStyle, SlideProgress } from "./section";
import { FloatingBar, Popover } from "./overlay";
import { Z } from "./z";
import { IconButton, Spinner } from "./button";
import { classifySwipe, pressOnContent, TAP_SLOP, tapZone } from "./gesture";
import { isCoarsePointer, isPhone, prefersReducedMotion } from "./viewport";
import { buildGroups, runBuild, runTransition } from "./motion";
import { asFormat as asSurface } from "@model/analytics";
import { Icon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./icons";
import {
    createNarrationPlayer,
    createSoundtrackPlayer,
    NarrationAudio,
    NarrationCaption,
    type NarrationSource,
    type SoundtrackSource,
} from "./narration";

const MINI_W = 250; // overview thumb width
// how long after a link click a fullscreen exit still counts as the browser's, not the presenter's
const LINK_EXIT_MS = 1500;

// "enter" builds the content without a slide transition; "none" is a repaint (resize, re-paginate).
type MotionCue = "none" | "forward" | "back" | "enter";

/** What a host can ask of an open surface. Deliberately tiny: everything else flows through props. */
export interface PresentHandle {
    reloadNarration(): Promise<void>;
}

/** One line in the bed picker: small, quiet, and legible over whatever is behind the bar. */
const BedRow: Component<{
    label: string;
    hint?: string;
    chosen?: boolean;
    onPick: () => void;
}> = (props) => (
    <button
        class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/75 transition-colors hover:bg-white/10 hover:text-white"
        onClick={() => props.onPick()}
    >
        <span class="w-3 flex-none text-accent">{props.chosen ? "\u2713" : ""}</span>
        <span class="min-w-0 flex-1 truncate">{props.label}</span>
        <Show when={props.hint}>
            <span class="flex-none text-[10px] text-white/40">{props.hint}</span>
        </Show>
    </button>
);

const none = (): Promise<null> => Promise.resolve(null);

export const PresentSurface: Component<{
    artifact: ArtifactContent;
    z?: number;
    autoFullscreen?: boolean;
    // read-only viewing rather than presenting: drops the fullscreen control and its key
    viewOnly?: boolean;
    // the slide grid on `O`; paged formats only, since a continuous stack is already its own overview
    overview?: boolean;
    // the presenter's notes pane on `N`. Never set on publish: cues are for the speaker alone, and
    // the public payload carries no notes to show even if it were.
    notes?: boolean;
    // Offered inside the notes pane when a section has none and the host can author, so an author
    // who opened the pane and found it empty has somewhere to go.
    notesActions?: () => { label: string; run: () => void; busy?: boolean }[];
    // why the last action failed. Without this a refused run looks like a button that does nothing.
    notesError?: () => string | null;
    // wired → the piece can play itself. No source means no controls at all, which is how an
    // unconfigured deployment stays quiet rather than showing a dead button.
    narration?: NarrationSource;
    // wired → this host can write a script for a section that has none, so the piece can be
    // narrated on the first press rather than only after someone wrote notes somewhere else
    scriptable?: boolean;
    // wired → the bar offers the bed. Absent means no control at all; present with an `enable`
    // means the first press is what turns music on, which is the only place a presenter is asked.
    soundtrack?: SoundtrackSource;
    // which surface this is, for the one event a listen produces; defaults to the standalone present
    where?: "editor" | "present" | "publish";
    onExit?: () => void;
    // leaving fullscreen by Esc fires no keydown, so a host that entered it wants to close on exit
    onFullscreenExit?: () => void;
    // furthest slide (paged) or section (continuous) reached, 0-based, + total
    onProgress?: (reached: number, total: number) => void;
    /** Handed the surface's imperative handle, for a host that has to re-read the narration. */
    ref?: (handle: PresentHandle) => void;
    /** Opened by "Play with voice": start narrating as soon as there is something to narrate. */
    autoNarrate?: boolean;
    children?: JSX.Element;
}> = (props) => {
    let overlay!: HTMLDivElement;
    let host!: HTMLDivElement;
    let sectionTops: number[] = []; // continuous mode: y offset of each section, from the last paint
    let sectionHeights: number[] = []; // same paint, so a pinned nav's cover is measurable
    const [index, setIndex] = createSignal(0);
    const [showOverview, setShowOverview] = createSignal(false);
    const [showNotes, setShowNotes] = createSignal(false);
    const [scrolledSection, setScrolledSection] = createSignal(0);
    // the painted stack height, so a continuous section's own height is measurable
    const [paintedH, setPaintedH] = createSignal(0);
    const tokens = createMemo(() => resolveTheme(props.artifact.theme).tokens);
    const profile = createMemo(() => profileFor(props.artifact));
    const paged = createMemo(() => profile().kind === "paged");
    // A tall paged section spans several 16:9 slides; map a flat slide index ↔ (section, page).
    // Counting lays out a section, so count only up to the one on screen; assume 1 slide for the rest.
    const [counted, setCounted] = createSignal(0);
    const slideCounts = createMemo(() => {
        if (!paged()) return [];
        const upTo = Math.max(counted(), 1);
        return props.artifact.sections.map((s, i) =>
            i < upTo ? sectionSlideCount(s, tokens(), profile()) : 1,
        );
    });
    const total = (): number =>
        paged() ? slideCounts().reduce((a, b) => a + b, 0) : props.artifact.sections.length;
    const locate = (flat: number): { si: number; page: number } => locateSlide(slideCounts(), flat);
    const clamp = (i: number): number => Math.max(0, Math.min(total() - 1, i));
    // A repaint has no direction of its own: a resize and an advance both land in the same effect,
    // so the verb that caused it says what motion to play.
    let cue: MotionCue = "enter";
    const next = (): void => {
        cue = "forward";
        setIndex((i) => clamp(i + 1));
    };
    const prev = (): void => {
        cue = "back";
        setIndex((i) => clamp(i - 1));
    };
    // Keep the index in range if the slide count changes mid-present (e.g. a theme swap re-paginates).
    createEffect(() => {
        const t = total();
        setIndex((i) => Math.max(0, Math.min(t - 1, i)));
    });

    // The slide already owns a viewport-fit scale and its content a second one, so motion gets a
    // stage of its own rather than sharing either transform.
    const stageFor = (slide: HTMLElement): HTMLDivElement => {
        const stage = document.createElement("div");
        stage.className = "absolute inset-0 flex items-center justify-center";
        stage.appendChild(slide);
        return stage;
    };

    // Where the live overlay mounts, and the boxes it anchors to. Continuous keeps one host for the
    // life of the surface so a player survives a repaint; a paged render builds a new slide each
    // time, so its overlay is rebuilt with it.
    const [liveHost, setLiveHost] = createSignal<HTMLElement | null>(null);
    const [liveRegions, setLiveRegions] = createSignal<Region[]>([]);
    // the profile the boxes under the overlay were laid out at, not the artifact's own
    const [liveFormat, setLiveFormat] = createSignal<FormatDescriptor>(profileFor(props.artifact));
    // A pinned layer slides out from under its own slot as the page scrolls; the overlay is anchored
    // to the static layout, so it has to be carried the same distance.
    const [scrolled, setScrolled] = createSignal(0);
    const liveOffsetY = (regionId: string): number => {
        if (paged()) return 0;
        const t = parseTarget(regionId);
        if (t?.kind !== "element") return 0;
        return pinnedShift(props.artifact.sections, sectionTops, scrolled(), t.address.section);
    };

    const renderPaged = (motion: MotionCue): void => {
        if (!host) return;
        const { si, page } = locate(index());
        const section = props.artifact.sections[si];
        if (!section) return;
        const { w, h } = sectionFrame(section, profile());
        const slide = slideElement(section, tokens(), profile(), page);
        setLiveRegions(slide.regions);
        setLiveFormat(profile());
        setLiveHost(slide.content);
        const k = Math.min((window.innerWidth - 24) / w, (window.innerHeight - 24) / h);
        slide.el.style.transform = `scale(${k})`;
        slide.el.style.transformOrigin = "center center";
        slide.el.style.borderRadius = "4px";
        const stage = stageFor(slide.el);
        const m = motionFor(tokens());
        const dir = motion === "back" ? -1 : 1;
        const animated = motion === "forward" || motion === "back";

        if (!animated) host.replaceChildren(stage);
        else {
            // an advance mid-transition leaves an intermediate stage behind: only what the viewer
            // is looking at survives to be animated out
            const outgoing = host.lastElementChild as HTMLElement | null;
            for (const child of [...host.children]) if (child !== outgoing) child.remove();
            if (outgoing) outgoing.style.pointerEvents = "none";
            host.appendChild(stage);
            void runTransition(outgoing, stage, m, dir).then(() => outgoing?.remove());
        }
        if (motion !== "none") runBuild(buildGroups(section.root, slide.commands, slide.nodes), m);
    };
    // Reveals are one-shot per section per session: windowing drops a layer's DOM outside the
    // retention band and rebuilds it, so tracking this on the element would re-fire on the way back.
    const revealed = new Set<string>();
    const pending = new Map<Element, SectionLayer>();
    const seen = new WeakSet<Element>();
    let reveals: IntersectionObserver | null = null;

    const observeReveals = (layers: SectionLayer[]): void => {
        if (motionFor(tokens()).build === "none" || prefersReducedMotion()) return;
        if (!reveals)
            reveals = new IntersectionObserver(
                (entries) => {
                    for (const e of entries) {
                        const layer = pending.get(e.target);
                        if (!layer) continue;
                        // A section painted while already on screen is simply there; only one
                        // scrolled to afterwards arrives.
                        const first = !seen.has(e.target);
                        if (first) seen.add(e.target);
                        if (!e.isIntersecting) continue;
                        if (!first)
                            runBuild(
                                buildGroups(layer.section.root, layer.commands, layer.nodes),
                                motionFor(tokens()),
                            );
                        revealed.add(layer.id);
                        reveals?.unobserve(e.target);
                        pending.delete(e.target);
                    }
                },
                { root: host },
            );
        for (const layer of layers) {
            if (revealed.has(layer.id) || pending.has(layer.el)) continue;
            pending.set(layer.el, layer);
            reveals.observe(layer.el);
        }
    };
    onCleanup(() => reveals?.disconnect());

    // one stage for the life of the surface, so a repaint on scroll swaps layers instead of the document
    let stage: HTMLDivElement | null = null;
    let paintHost: HTMLDivElement | null = null;
    let overlayHost: HTMLDivElement | null = null;
    const stackCache = createSectionStackCache();
    const fontsSettled = createFontsInvalidator(stackCache);
    let lastWindow: StackWindow | null = null;
    // What this reader has opened or switched to, keyed by element address. Never written back:
    // the stored value is the author's default, this is one session's view of it.
    const viewerPatches = new Map<string, Record<string, unknown>>();
    let stackRegions: Region[] = [];
    let lastArtifact: ArtifactContent | null = null;

    const shownContent = (): ArtifactContent => withViewerPatches(props.artifact, viewerPatches);

    const renderContinuous = (): void => {
        if (!host) return;
        const fullW = host.clientWidth || window.innerWidth;
        const prof = previewContentProfile(profile(), isPhone());
        setLiveFormat(prof);
        if (!stage || !paintHost || !overlayHost) {
            stage = document.createElement("div");
            paintHost = document.createElement("div");
            paintHost.style.cssText = "position:absolute;inset:0";
            overlayHost = document.createElement("div");
            // Above the pinned layers: `stage` opens no stacking context, so an auto-z overlay
            // sits UNDER a stuck nav and every press on a live element in one falls through to
            // the painted stack (and from there to the viewer-toggle scan).
            overlayHost.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:${PINNED_Z + 1}`;
            stage.append(paintHost, overlayHost);
        }
        setLiveHost(overlayHost);
        if (stage.parentElement !== host) host.replaceChildren(stage);
        stage.style.cssText = `position:relative;width:${fullW}px`;
        const viewH = host.clientHeight || window.innerHeight;
        const win = stackWindow(host.scrollTop, viewH);
        lastWindow = win;
        const { tops, heights, height, layers, regions } = paintSectionStack(
            paintHost,
            shownContent().sections,
            prof,
            tokens(),
            { fullW, cache: stackCache, window: win, pinned: true },
        );
        observeReveals(layers);
        sectionTops = tops;
        sectionHeights = heights;
        stackRegions = regions;
        setLiveRegions(regions);
        setPaintedH(height);
        stage.style.height = `${height}px`;
        reportScrollProgress();
    };

    // A viewer's press on a `hit:` region, resolved against the static layout the regions describe.
    const toggleAt = (e: PointerEvent): void => {
        if (!stage) return;
        const r = stage.getBoundingClientRect();
        const shown = shownContent();
        const hit = viewerToggleAt(
            shown,
            stackRegions,
            { x: e.clientX - r.left, y: e.clientY - r.top },
            (sectionId) => pinnedShift(shown.sections, sectionTops, scrolled(), sectionId),
        );
        if (!hit) return;
        viewerPatches.set(hit.key, { ...viewerPatches.get(hit.key), ...hit.patch });
        renderContinuous();
    };
    // The grid is painted rather than composed, because each cell is a real slide render scaled down:
    // a Solid list of them would mean a component per section over the same imperative backend.
    const renderOverview = (): void => {
        if (!host) return;
        setLiveHost(null); // the grid replaces whatever the overlay was anchored to
        const tk = tokens();
        const grid = document.createElement("div");
        grid.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(${MINI_W}px,1fr));gap:18px;padding:48px;width:100%;max-width:1280px;margin:0 auto;align-content:start`;
        const counts = slideCounts();
        props.artifact.sections.forEach((section, i) => {
            const first = firstSlideOf(counts, i);
            const fr = sectionFrame(section, profile()); // per-section: a section may set its own aspect
            const s = MINI_W / fr.w;
            const slide = slideElement(section, tk, profile()).el;
            slide.style.transform = `scale(${s})`;
            slide.style.transformOrigin = "top left";
            const cell = document.createElement("button");
            const current = locate(index()).si === i;
            cell.style.cssText = `position:relative;width:${MINI_W}px;height:${fr.h * s}px;overflow:hidden;border-radius:9px;border:2px solid ${current ? tk.accent : tk.line};cursor:pointer;background:${tk.bg};padding:0`;
            cell.appendChild(slide);
            const num = document.createElement("span");
            num.textContent = String(i + 1);
            num.style.cssText = `position:absolute;left:7px;top:6px;font:600 10px/1 ui-monospace,monospace;color:${tk.muted};background:${tk.surface};border-radius:5px;padding:2px 5px`;
            cell.appendChild(num);
            cell.onclick = () => {
                cue = first === index() ? "enter" : first > index() ? "forward" : "back";
                setIndex(first);
                setShowOverview(false);
            };
            grid.appendChild(cell);
        });
        host.replaceChildren(grid);
    };

    // Addresses only mean anything against the tree they were read from, and a live disclosure is
    // chrome this reader opens rather than something the author already opened for them.
    const resetViewerState = (): void => {
        if (lastArtifact === props.artifact) return;
        lastArtifact = props.artifact;
        setScrolled(0);
        viewerPatches.clear();
        for (const [key, patch] of seedViewerPatches(props.artifact)) viewerPatches.set(key, patch);
    };

    const render = (motion: MotionCue = "none"): void => {
        resetViewerState();
        if (!paged()) renderContinuous();
        else if (showOverview()) renderOverview();
        else renderPaged(motion);
    };

    const onScrollWindow = (): void => {
        if (paged() || !host) return;
        const viewH = host.clientHeight || window.innerHeight;
        if (windowMoved(lastWindow, stackWindow(host.scrollTop, viewH), viewH)) renderContinuous();
    };

    // continuous: a section counts as reached once its top scrolls into view
    const reportScrollProgress = (): void => {
        if (!host || !sectionTops.length) return;
        const seen = host.scrollTop + host.clientHeight;
        let reached = 0;
        for (let i = 0; i < sectionTops.length; i++) if (sectionTops[i]! < seen) reached = i;
        // what the notes pane is about is the section under the viewport's middle, not the furthest
        // one glimpsed at its bottom edge
        const middle = host.scrollTop + host.clientHeight / 2;
        let current = 0;
        for (let i = 0; i < sectionTops.length; i++) if (sectionTops[i]! <= middle) current = i;
        setScrolledSection(current);
        props.onProgress?.(reached, props.artifact.sections.length);
    };

    /** The section the viewer is on, however this format measures that. */
    const currentSection = createMemo(() =>
        paged()
            ? props.artifact.sections[locate(index()).si]
            : props.artifact.sections[scrolledSection()],
    );

    // Narration drives the surface through goToSection rather than owning an index of its own, so
    // paged and continuous advance by the same call.
    const goToSection = (sectionId: string): void => {
        const at = props.artifact.sections.findIndex((s) => s.id === sectionId);
        if (at < 0) return;
        if (paged()) {
            const to = firstSlideOf(slideCounts(), at);
            cue = to === index() ? "none" : to > index() ? "forward" : "back";
            setIndex(to);
            return;
        }
        const top = sectionScrollTop(
            props.artifact.sections,
            sectionTops,
            sectionHeights,
            sectionId,
        );
        host?.scrollTo({ top: top ?? 0, behavior: "smooth" });
    };

    // Chrome leaves element fullscreen by itself when a `target="_blank"` link opens a tab, and
    // that arrives as an ordinary fullscreenchange. Without this the host would read it as the
    // presenter quitting and tear the session down behind the new tab. Captured on the document
    // rather than the host: a popup's panel is painted into a portal, so its anchors never reach
    // the delegate below (see onDocClick in onMount).
    let externalNavAt = 0;
    const noteExternalNav = (target: EventTarget | null): void => {
        const href = (target as Element | null)?.closest?.("a")?.getAttribute("href");
        if (href && !sectionLinkId(href)) externalNavAt = performance.now();
    };

    // A `#section` link is a move within the piece, so it never navigates: the delegate sits on the
    // host because the stack's anchors are painted into it rather than rendered by Solid.
    const onContentClick = (e: MouseEvent): void => {
        const a = (e.target as Element | null)?.closest?.("a");
        const id = a && sectionLinkId(a.getAttribute("href"));
        if (!id) return;
        e.preventDefault();
        goToSection(id);
    };
    const player = createNarrationPlayer({
        source: () => props.narration,
        where: () => props.where ?? "present",
        artifactFormat: () => asSurface(props.artifact.format),
        goToSection,
        currentSection: () => currentSection()?.id,
        order: () => props.artifact.sections.map((s) => s.id),
        scriptable: () => !!props.scriptable,
        stale: () => new Set(props.artifact.sections.filter(scriptStale).map((s) => s.id)),
        scripted: () =>
            new Set(props.artifact.sections.filter((s) => s.notes?.spoken.trim()).map((s) => s.id)),
        onError: (m) => setPlayError(m),
    });
    const [playError, setPlayError] = createSignal<string | null>(null);
    const bed = createSoundtrackPlayer({
        source: () => props.soundtrack,
        speaking: () => player.playing() && !player.recording(),
        volume: () => props.artifact.music?.volume ?? MUSIC_VOLUME,
        where: () => (props.where === "publish" ? "publish" : "present"),
        artifactFormat: () => asSurface(props.artifact.format),
        onError: (m) => setPlayError(m),
    });
    const [showCaption, setShowCaption] = createSignal(false);
    // the bed picker hangs off the music button; the shelf loads the first time it opens
    const [pickingBed, setPickingBed] = createSignal(false);
    const [shelf, setShelf] = createSignal<WorkspaceBed[]>([]);
    let musicBtn: HTMLButtonElement | undefined;

    const openBedPicker = (): void => {
        setPickingBed(true);
        const list = props.soundtrack?.shelf;
        if (list)
            void list()
                .then(setShelf)
                .catch(() => setShelf([]));
    };

    /** Choosing is the same act whichever row was pressed: swap what plays, close, report. */
    const pickBed = (run: () => Promise<Soundtrack | null>): void => {
        setPickingBed(false);
        bed.setBusy(true);
        void run()
            .then((next) => bed.put(next))
            .catch((e: unknown) =>
                setPlayError(e instanceof Error ? e.message : "That music could not be started."),
            )
            .finally(() => bed.setBusy(false));
    };
    // a press landed on a section that was never recorded, and it is being read in now
    const waiting = (): boolean => player.recording();

    const sectionIndexOf = (sectionId: string): number =>
        props.artifact.sections.findIndex((s) => s.id === sectionId);

    /** Every screenful of the piece, in order: slide pages when paged, viewport chunks when not. */
    const steps = createMemo((): Step[] => {
        const ids = props.artifact.sections.map((s) => s.id);
        return paged()
            ? pagedSteps(ids, slideCounts())
            : continuousSteps(ids, sectionTops, paintedH(), host?.clientHeight ?? 0);
    });

    // A section taller than one screen is traversed while its own track plays: a three-page slide
    // over a thirty-second track turns a page every ten seconds. Without this the audio would talk
    // about content still below the fold.
    createEffect(
        on([player.speaking, () => player.playing()], ([sectionId, on]) => {
            if (!sectionId || !on) return;
            const own = steps().filter((s) => s.sectionId === sectionId);
            const track = player.trackFor(sectionId);
            if (own.length <= 1 || !track) return;
            const hold = stepHoldMs(track.ms, own.length);
            const timers = own.slice(1).map((step, i) =>
                setTimeout(
                    () => {
                        if (paged())
                            setIndex(
                                firstSlideOf(slideCounts(), sectionIndexOf(sectionId)) + i + 1,
                            );
                        else host?.scrollTo({ top: step.top ?? 0, behavior: "smooth" });
                    },
                    hold * (i + 1),
                ),
            );
            onCleanup(() => timers.forEach(clearTimeout));
        }),
    );

    // Manual navigation moves the narration: settling on a section retargets the audio there. The
    // 400ms hold is what keeps a scroll past six sections from firing six track changes.
    let retargetTimer: ReturnType<typeof setTimeout> | undefined;
    createEffect(
        on(currentSection, (section) => {
            if (!section || !player.playing()) return;
            clearTimeout(retargetTimer);
            retargetTimer = setTimeout(() => player.retarget(section.id), 400);
        }),
    );
    onCleanup(() => clearTimeout(retargetTimer));

    // render() reads slideCounts through locate(), and the progress effect below bumps `counted`
    // after every advance: tracked, that second run would repaint over the transition it just
    // started. Declare the repaint deps here and paint untracked.
    createEffect(() => {
        index();
        tokens();
        showOverview();
        fontsSettled();
        void props.artifact;
        // an overview repaint must not eat the cue, or a grid click lands without motion
        const consumed = paged() && !showOverview();
        const motion = consumed ? cue : "none";
        if (consumed) cue = "none";
        untrack(() => render(motion));
    });
    createEffect(() => {
        if (!paged()) return;
        const { si } = locate(index());
        setCounted((c) => Math.max(c, si + 2)); // count one ahead of where the viewer is
        props.onProgress?.(index(), total());
    });

    const toggleFs = (): void => {
        if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {});
        else void overlay?.requestFullscreen?.()?.catch(() => {});
    };

    // Fine pointer: click anywhere advances. Coarse: swipe, plus a back zone on the leading edge.
    let down: { x: number; y: number; t: number } | null = null;
    const onPointerDown = (e: PointerEvent): void => {
        if (paged() && showOverview()) return;
        down = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    };
    const onPointerUp = (e: PointerEvent): void => {
        if (!paged()) {
            const start = down;
            down = null;
            if (!start || pressOnContent(e.target)) return;
            const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
            if (moved <= TAP_SLOP) toggleAt(e);
            return;
        }
        if (showOverview()) return;
        const start = down;
        down = null;
        if (!start || pressOnContent(e.target)) return;
        if (!isCoarsePointer()) {
            next();
            return;
        }
        const swipe = classifySwipe({
            dx: e.clientX - start.x,
            dy: e.clientY - start.y,
            dt: e.timeStamp - start.t,
        });
        const intent = swipe ?? tapZone(e.clientX, host?.clientWidth ?? 0);
        if (intent === "prev") prev();
        else next();
    };

    onMount(() => {
        props.ref?.({ reloadNarration: () => player.reload() });
        // The click that opened this surface is the gesture browsers require, but recording the
        // first section can outlast it. If the play is refused, the player falls back to paused and
        // the control is already on screen, so the recovery is one click rather than a dead end.
        if (props.autoNarrate) queueMicrotask(() => player.toggle());
        if (props.autoFullscreen) void overlay?.requestFullscreen?.()?.catch(() => {});
        const onKey = (e: KeyboardEvent): void => {
            // While narrating, Space is play and pause: that is what people press, and the arrows
            // still step. With narration off every existing binding is untouched.
            if (e.key === " " && player.playing()) {
                e.preventDefault();
                player.toggle();
                return;
            }
            if ((e.key === "c" || e.key === "C") && player.ready()) {
                setShowCaption((v) => !v);
                return;
            }
            // no button on the bar for this: it is a presenter's aside, reachable by key and
            // closed from its own header, and it was crowding the controls that matter mid-talk
            if ((e.key === "n" || e.key === "N") && props.notes) {
                setShowNotes((v) => !v);
                return;
            }
            if ((e.key === "o" || e.key === "O") && props.overview && paged()) {
                setShowOverview((v) => !v);
                return;
            }
            if (e.key === "Escape" && showOverview()) {
                setShowOverview(false);
                return;
            }
            // an open pane is what Escape means next; exiting the whole surface is the last resort
            if (e.key === "Escape" && showNotes()) {
                setShowNotes(false);
                return;
            }
            if (paged()) {
                if (showOverview() && e.key !== "f" && e.key !== "F") return;
                if (e.key === "ArrowRight" || e.key === " " || e.key === "ArrowDown") next();
                else if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev();
                else if ((e.key === "f" || e.key === "F") && !props.viewOnly) toggleFs();
                else if (e.key === "Escape") props.onExit?.();
                return;
            }
            if (e.key === " " || e.key === "ArrowDown" || e.key === "PageDown") {
                e.preventDefault();
                host?.scrollBy({ top: host.clientHeight * 0.9, behavior: "smooth" });
            } else if (e.key === "ArrowUp" || e.key === "PageUp") {
                e.preventDefault();
                host?.scrollBy({ top: -host.clientHeight * 0.9, behavior: "smooth" });
            } else if ((e.key === "f" || e.key === "F") && !props.viewOnly) toggleFs();
            else if (e.key === "Escape") props.onExit?.();
        };
        const onResize = (): void => render("none");
        const onDocClick = (e: MouseEvent): void => noteExternalNav(e.target);
        // Esc leaves fullscreen natively without a keydown, so a host that opened it treats that as
        // a close. A tab opened from a link is not that: the browser dropped fullscreen on its own,
        // and both signals are read because fullscreenchange and the focus loss race per browser.
        const onFsChange = (): void => {
            if (document.fullscreenElement) return;
            if (performance.now() - externalNavAt < LINK_EXIT_MS || !document.hasFocus()) return;
            props.onFullscreenExit?.();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("resize", onResize);
        document.addEventListener("click", onDocClick, true);
        document.addEventListener("fullscreenchange", onFsChange);
        onCleanup(() => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onResize);
            document.removeEventListener("click", onDocClick, true);
            document.removeEventListener("fullscreenchange", onFsChange);
        });
    });

    // pan-y claims horizontal, so a swipe never triggers browser back-navigation
    const PAGED_HOST = "h-full w-full touch-pan-y select-none overscroll-x-contain";
    const hostClass = createMemo((): string => {
        if (!paged()) return "h-full w-full overflow-y-auto";
        // the overview grid scrolls; the slide stack must not, or a slide translating out of frame
        // would extend the scroll range mid-transition
        return showOverview()
            ? `flex items-center justify-center overflow-auto ${PAGED_HOST}`
            : `relative overflow-hidden ${PAGED_HOST}`;
    });

    const hostStyle = createMemo(
        (): JSX.CSSProperties => backdropHostStyle(paged(), props.artifact.background, tokens()),
    );
    const ctrl = (): "md" | "touch" => (isCoarsePointer() ? "touch" : "md");

    return (
        <div
            ref={overlay}
            class="fixed inset-0 bg-[#0a0a0c]"
            style={{ "z-index": props.z ?? Z.present }}
        >
            <div
                ref={host}
                class={hostClass()}
                style={hostStyle()}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onClick={onContentClick}
                onScroll={() => {
                    if (paged()) return;
                    setScrolled(host?.scrollTop ?? 0);
                    reportScrollProgress();
                    onScrollWindow();
                }}
            />
            {/* keyed: a paged render builds a new content host, and a Portal reads `mount` once */}
            <Show keyed when={liveHost()}>
                {(mount) => (
                    <Portal mount={mount}>
                        <LiveLayer
                            content={shownContent()}
                            regions={liveRegions}
                            surface={props.where === "publish" ? "publish" : "present"}
                            theme={tokens()}
                            format={liveFormat()}
                            offsetY={liveOffsetY}
                            onSectionLink={goToSection}
                        />
                    </Portal>
                )}
            </Show>
            <Show when={paged() && !showOverview()}>
                <SlideProgress index={index()} total={total()} />
            </Show>
            {/* narration is an element; the bed is a Web Audio graph and needs none */}
            <NarrationAudio mount={player.mount} />
            <Show when={playError()}>
                <div class="pointer-events-none absolute inset-x-0 bottom-24 z-raised flex justify-center px-6">
                    <p class="rounded-lg bg-black/70 px-3 py-2 text-[12px] text-[#ff9d9d] backdrop-blur-sm">
                        {playError()}
                    </p>
                </div>
            </Show>
            <Show when={showCaption()}>
                <NarrationCaption caption={player.caption} />
            </Show>
            <Show when={props.notes && showNotes() && currentSection()}>
                {(section) => (
                    <aside class="pointer-events-auto absolute inset-x-0 bottom-0 z-raised flex max-h-[38dvh] flex-col border-t border-white/10 bg-[#0a0a0c]/95 backdrop-blur-md">
                        <div class="flex items-center justify-between px-6 pt-3">
                            <span class="font-mono text-[10px] uppercase tracking-[0.08em] text-white/45">
                                Speaker notes
                            </span>
                            <IconButton
                                size={ctrl()}
                                rounded="lg"
                                tone="onDark"
                                title="Close notes (N)"
                                onClick={() => setShowNotes(false)}
                            >
                                <CloseIcon size={15} />
                            </IconButton>
                        </div>
                        {/* pb-20 clears the control bar, which floats above this pane */}
                        <div class="overflow-y-auto px-6 pb-20 pt-2">
                            <Show
                                when={section().notes?.spoken.trim()}
                                fallback={
                                    <p class="text-[13px] text-white/45">
                                        Nothing to say on this section yet.
                                    </p>
                                }
                            >
                                <p class="whitespace-pre-wrap text-[15px] leading-relaxed text-white/90">
                                    {section().notes?.spoken}
                                </p>
                            </Show>
                            <Show when={section().notes?.cues?.length}>
                                <ul class="mt-3 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                                    <For each={section().notes?.cues ?? []}>
                                        {(cue) => (
                                            <li class="rounded-full bg-white/10 px-2.5 py-1 text-[12px] text-white/70">
                                                {cue}
                                            </li>
                                        )}
                                    </For>
                                </ul>
                            </Show>
                            {/* reachable whether or not this section has a script: with one, the
                                thing left to do is record it */}
                            <Show when={props.notesError?.()}>
                                <p class="mt-3 text-[12px] leading-snug text-[#ff9d9d]">
                                    {props.notesError?.()}
                                </p>
                            </Show>
                            <Show when={props.notesActions?.().length}>
                                <div class="mt-3 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                                    <For each={props.notesActions?.() ?? []}>
                                        {(a) => (
                                            <button
                                                class="rounded-lg border border-white/15 px-2.5 py-1.5 text-[12px] font-semibold text-white/80 hover:border-white/35 hover:text-white disabled:opacity-50"
                                                disabled={a.busy}
                                                onClick={() => a.run()}
                                            >
                                                {a.label}
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </div>
                    </aside>
                )}
            </Show>
            <FloatingBar
                tone="dark"
                anchor="bottomCenter"
                rounded="xl"
                class="z-panel"
                onClick={(e) => e.stopPropagation()}
            >
                <Show when={paged() && !showOverview()}>
                    <IconButton
                        size={ctrl()}
                        rounded="lg"
                        tone="onDark"
                        title="Previous (←)"
                        onClick={prev}
                    >
                        <ChevronLeftIcon size={16} />
                    </IconButton>
                    <span class="whitespace-nowrap px-1.5 font-mono text-[12px] tabular-nums text-white/80">
                        {index() + 1} / {total()}
                    </span>
                    <IconButton
                        size={ctrl()}
                        rounded="lg"
                        tone="onDark"
                        title="Next (→)"
                        onClick={next}
                    >
                        <ChevronRightIcon size={16} />
                    </IconButton>
                    <span class="mx-1 h-4 w-px bg-white/15" />
                </Show>
                {/* Music never starts on its own, so this is always the way in: pressing it opens
                    the list of beds, and pressing it again while one plays stops it. */}
                <Show when={bed.offered()}>
                    <IconButton
                        size={ctrl()}
                        rounded="lg"
                        tone="onDark"
                        live={bed.playing()}
                        disabled={bed.busy()}
                        title={
                            bed.busy()
                                ? "Composing…"
                                : !bed.ready()
                                  ? "Add background music (uses credits)"
                                  : bed.playing()
                                    ? "Music off"
                                    : "Background music"
                        }
                        ref={(el) => (musicBtn = el)}
                        onClick={() => (bed.playing() ? bed.stop() : openBedPicker())}
                    >
                        {/* Always the music note, whether the bed exists yet or not: the button is
                            about music, and an AI glyph here described how it gets made rather than
                            what it is. Which of the two it is doing is the tooltip's job. Composing
                            is the one state with its own mark, and it is a wait, so it is a
                            spinner, the same as narration recording. */}
                        <Show when={!bed.busy()} fallback={<Spinner size={13} tone="current" />}>
                            <Icon name="music" size={15} classList={{ sounding: bed.playing() }} />
                        </Show>
                    </IconButton>
                    {/* Deliberately bare and dark: it sits over someone's work, so it borrows the
                        bar's own surface rather than opening a panel of its own. */}
                    <Popover
                        anchor={() => musicBtn}
                        open={pickingBed()}
                        onClose={() => setPickingBed(false)}
                        align="center"
                        fixedWidth={196}
                        bare
                        panelClass="rounded-xl bg-black/70 p-1 backdrop-blur-md"
                    >
                        <BedRow
                            label="No music"
                            chosen={!bed.current()}
                            onPick={() => pickBed(() => props.soundtrack?.choose?.(null) ?? none())}
                        />
                        <For each={shelf()}>
                            {(b) => (
                                <BedRow
                                    label={b.name}
                                    chosen={bed.current() === b.id}
                                    onPick={() =>
                                        pickBed(() => props.soundtrack?.choose?.(b.id) ?? none())
                                    }
                                />
                            )}
                        </For>
                        <Show when={props.soundtrack?.composeForPiece}>
                            <div class="my-1 h-px bg-white/12" />
                            <BedRow
                                label="Write one for this piece"
                                hint="uses credits"
                                onPick={() =>
                                    pickBed(() => props.soundtrack?.composeForPiece?.() ?? none())
                                }
                            />
                        </Show>
                    </Popover>
                </Show>
                {/* One control until it is running: starting narration is the only thing to say
                    at that point. Once it speaks, pause and captions are the two things worth
                    reaching for, and captions are meaningless before there is anything to caption. */}
                <Show when={player.ready()}>
                    <IconButton
                        size={ctrl()}
                        rounded="lg"
                        tone="onDark"
                        live={player.playing()}
                        disabled={waiting()}
                        title={
                            waiting()
                                ? "Reading it in…"
                                : player.playing()
                                  ? "Pause narration (space)"
                                  : player.prepared()
                                    ? `Play with voice${player.voiceName() ? ` (${player.voiceName()})` : ""}`
                                    : "Read this aloud (records it first)"
                        }
                        onClick={() => player.toggle()}
                    >
                        {/* Nothing recorded yet offers to record (a mic, not a play triangle that
                            would lie about what the press does); recording is a wait; audio that
                            exists and is not running offers to play it. While it speaks the mic
                            comes back and breathes, which is the same thing the music note does:
                            the glyph says which sound it is, the motion says it is happening. */}
                        <Show when={!waiting()} fallback={<Spinner size={14} tone="current" />}>
                            <Icon
                                name={player.prepared() && !player.playing() ? "play" : "mic"}
                                size={16}
                                classList={{ sounding: player.playing() }}
                            />
                        </Show>
                    </IconButton>
                    <Show when={player.playing()}>
                        <IconButton
                            size={ctrl()}
                            rounded="lg"
                            tone="onDark"
                            active={showCaption()}
                            title="Captions (C)"
                            onClick={() => setShowCaption((v) => !v)}
                        >
                            <Icon name="captions" size={15} />
                        </IconButton>
                    </Show>
                    <span class="mx-1 h-4 w-px bg-white/15" />
                </Show>
                <Show when={props.overview && paged()}>
                    <IconButton
                        size={ctrl()}
                        rounded="lg"
                        tone="onDark"
                        active={showOverview()}
                        title="Overview (O)"
                        onClick={() => setShowOverview((v) => !v)}
                    >
                        <Icon name="grid" size={15} />
                    </IconButton>
                </Show>
                <Show when={!props.viewOnly}>
                    <IconButton
                        size={ctrl()}
                        rounded="lg"
                        tone="onDark"
                        title="Fullscreen (F)"
                        onClick={toggleFs}
                    >
                        <Icon name="fullscreen" size={16} />
                    </IconButton>
                </Show>
                <Show when={props.onExit}>
                    <IconButton
                        size={ctrl()}
                        rounded="lg"
                        tone="onDark"
                        title="Exit (Esc)"
                        onClick={() => props.onExit?.()}
                    >
                        <CloseIcon size={16} />
                    </IconButton>
                </Show>
            </FloatingBar>
            {props.children}
        </div>
    );
};
