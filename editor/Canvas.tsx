import type { Rect } from "@engine/node";
import { embedFor, pickArtifactBackground, type Embed, type PlayerOpts } from "./core/media";
import type { ElementAddress, Target, ElementInstance, Section } from "@model/artifact";
import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { getElementAt, moveSection } from "@elements/ops";
import { getElement } from "@elements/spec";
import { profileFor } from "@engine/profile";
import { elementRegionId, parseTarget, specificity, targetsEqual } from "@model/artifact";
import { isPhone } from "@ui/viewport";
import {
    backdropCss,
    createSectionStackCache,
    paint,
    paintSectionStack,
    scaledHostCss,
    sectionFrameHeight,
    sectionLayoutWidth,
    type StackWindow,
} from "@canvas/render/backends";
import {
    planSectionRequests,
    stackWindow,
    viewIsCold,
    windowMoved,
    type Slot,
} from "@canvas/render/window";
import { layoutPlaceholder } from "@canvas/render/placeholder";
import { measureText, layoutSection, layoutSlide } from "@canvas/render/commands";
import {
    activeSlot,
    applyDrop,
    computeDropSlots,
    drag,
    dragSlots,
    endDrag,
    setDrag,
    setDragSlots,
} from "./core/dnd";
import { applyLiveEdit, liveEdit, sectionDrop, sectionDragId } from "./panels/Selection";
import {
    canvasContentWidth,
    commit,
    currentArtifactId,
    editing,
    editor,
    editorTokens,
    editSeq,
    regions,
    selection,
    setCanvasContentWidth,
    jumpToSection,
    leftOpen,
    knownHeight,
    pending as pendingSections,
    rememberHeight,
    requestSections,
    setCanvasEl,
    setHover,
    setRegions,
    setSectionTops,
    setSelection,
    setStageEl,
    slideFrame,
    startEditing,
    stopEditing,
} from "./core/store";
import { EmptyRegionAdd, ContextMenu, openContextMenu } from "./panels/Insert";
import { DropIndicators, LiftVeil } from "./panels/DropIndicators";
import { DragHandle, RegionDividers, ResizeHandles } from "./panels/Selection";
import { ContextBar } from "./panels/ControlBars";
import { Overlay, SectionActions } from "./panels/Selection";
import { SectionGenPopup } from "./panels/GenPrompt";
import { SectionGenStage } from "./panels/GenOverlays";
import { ElementGenStage } from "./panels/GenOverlays";
import { TextEditor } from "./panels/TextEditor";

const RAIL_GAP = 28;
const PANEL_L = 200;
const RAIL_R = 64;
// phone: no rails to clear — a sliver of gutter, sections take essentially the full width
const PHONE_PAD = 6;

export const Canvas: Component = () => {
    let scrollEl!: HTMLElement;
    let stageEl!: HTMLDivElement;
    let paintHost!: HTMLDivElement;

    // Precomputed per draw so hover is a numeric box test, not a re-parse of every region id.
    let liveHits: { target: Target; spec: number; box: Rect }[] = [];
    let pending: { target: Target | null; x: number; y: number } | null = null;

    // so a frame re-lays-out only the changed section (see paintSectionStack)
    const stackCache = createSectionStackCache();

    // the band of the stage that is materialized
    let lastWindow: StackWindow | null = null;

    // track: regions follow the preview (resize/column); off for DnD, so the drop target holds still
    const draw = (preview?: Section[] | null, track = false, dimId?: string | null): void => {
        if (!paintHost) return;
        const profile = profileFor(editor.artifact);
        // a bleeding format (site) covers the backdrop entirely on phone; others keep the sliver
        const phonePad = profile.bleedSections ? 0 : PHONE_PAD;
        const padL = isPhone() ? phonePad : leftOpen() ? PANEL_L : RAIL_GAP;
        const padR = isPhone() ? phonePad : RAIL_R;
        const fullW = Math.max(isPhone() ? 280 : 360, (scrollEl.clientWidth || 800) - padL - padR);
        setCanvasContentWidth(fullW); // so minimap thumbnails match this width
        // hide the painted text of the edited element; the live overlay shows it
        const editAddr = editing();
        const editId = editAddr ? elementRegionId(editAddr) : null;
        const viewH = scrollEl.clientHeight || 800;
        const win = stackWindow(scrollEl.scrollTop, viewH);
        lastWindow = win;
        const waiting = pendingSections();
        const beforeTops = editor.sectionTops;
        const { tops, heights, regions, height } = paintSectionStack(
            paintHost,
            preview ?? editor.artifact.sections,
            profile,
            editorTokens(),
            {
                fullW,
                hideId: editId,
                dimId,
                cache: stackCache,
                window: win,
                slideFrame: slideFrame(),
                placeholder: waiting.size
                    ? (s, layoutW) => {
                          const summary = waiting.get(s.id);
                          return summary
                              ? layoutPlaceholder(
                                    s,
                                    summary,
                                    layoutW,
                                    editorTokens(),
                                    profile,
                                    fullW,
                                    knownHeight(s.id, fullW),
                                )
                              : undefined;
                      }
                    : undefined,
            },
        );
        stageEl.style.height = `${height}px`;
        const drawn = preview ?? editor.artifact.sections;
        for (const [i, sec] of drawn.entries())
            if (!waiting.has(sec.id)) rememberHeight(sec.id, fullW, heights[i] ?? 0);
        // a loaded section rarely matches its estimate; absorb the difference to hold the reader's place
        anchorScroll(beforeTops, tops);
        setSectionTops(tops);
        // fetching runs on its own clock (see scheduleFetch): painting must never wait on the network
        if (waiting.size) scheduleFetch(viewH);
        if (!preview || track) {
            setRegions(regions);
            const hits: { target: Target; spec: number; box: Rect }[] = [];
            for (const r of regions) {
                const t = parseTarget(r.id);
                if (t) hits.push({ target: t, spec: specificity(t), box: r.box });
            }
            liveHits = hits;
        }
    };

    const anchorScroll = (before: number[], after: number[]): void => {
        if (before.length !== after.length) return;
        const top = scrollEl.scrollTop;
        let shift = 0;
        for (let i = 0; i < before.length; i++) {
            if (before[i]! >= top) break; // only what sat above the viewport can move it
            shift = after[i]! - before[i]!;
        }
        if (shift) scrollEl.scrollTop = top + shift;
    };

    // fetch only once scrolling settles, so a fling across the stack costs one request, not dozens
    const SETTLE_MS = 100;
    const PREFETCH_MAX = 8; // bounds the lead only; everything on screen is always requested
    let settleTimer = 0;
    let lastScrollTop = 0;
    let lastScrollAt = 0;
    let velocity = 0; // px/ms, signed by direction of travel

    const slotsNow = (): Slot[] => {
        const waiting = pendingSections();
        const tops = editor.sectionTops;
        return editor.artifact.sections.map((s, i) => ({
            id: s.id,
            top: tops[i] ?? 0,
            bottom: tops[i + 1] ?? (tops[i] ?? 0) + 1,
            pending: waiting.has(s.id),
        }));
    };

    const fetchNow = (viewH: number, prefetch: boolean): void => {
        if (!pendingSections().size) return;
        const view = { top: scrollEl.scrollTop, bottom: scrollEl.scrollTop + viewH };
        const lead = prefetch ? Math.sign(velocity || 1) * viewH : 0;
        const want = planSectionRequests({ slots: slotsNow(), view, lead, max: PREFETCH_MAX });
        if (want.length) void requestSections(want);
    };

    const scheduleFetch = (viewH: number): void => {
        const view = { top: scrollEl.scrollTop, bottom: scrollEl.scrollTop + viewH };
        // nothing readable on screen: don't make the viewer wait out the settle
        if (viewIsCold(slotsNow(), view)) fetchNow(viewH, false);
        window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(() => fetchNow(viewH, true), SETTLE_MS);
    };

    // one paint per frame; the latest queued state wins
    let rafId = 0;
    let queued: { sections: Section[] | null; track: boolean; dimId?: string | null } | null = null;
    const scheduleDraw = (
        sections: Section[] | null,
        track: boolean,
        dimId?: string | null,
    ): void => {
        queued = { sections, track, dimId };
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            const q = queued;
            queued = null;
            if (q) draw(q.sections, q.track, q.dimId);
        });
    };

    const point = (e: { clientX: number; clientY: number }): [number, number] => {
        const r = stageEl.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    };

    const hitTest = (px: number, py: number): Target | null => {
        let best: Target | null = null;
        let bestSpec = -1;
        for (const h of liveHits) {
            const b = h.box;
            if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) continue;
            if (h.spec > bestSpec) {
                bestSpec = h.spec;
                best = h.target;
            }
        }
        return best;
    };

    const onPointerDown = (e: PointerEvent): void => {
        // a pointerdown reaching here while editing is an outside click; in-editor ones are stopped
        if (drag() || liveEdit()) return;
        pending = { target: hitTest(...point(e)), x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent): void => {
        if (drag() || editing() || liveEdit() || sectionDrop() !== null) return; // driven by window listeners
        // Moves start only from the DragHandle, so a body drag never becomes an accidental move.
        setHover(hitTest(...point(e)));
    };

    const onPointerUp = (): void => {
        if (drag() || liveEdit() || !pending) return;
        const t = pending.target;
        const caret = { x: pending.x, y: pending.y };
        pending = null;
        // phone: first tap only selects — editing (and the keyboard) waits for a tap on the
        // already-selected text, so browsing a document never summons the keyboard
        const already = targetsEqual(t, selection());
        // stop editing first (idempotent) so a click on another text element switches straight into it
        if (editing()) stopEditing();
        setSelection(t);
        if (t?.kind === "element") {
            const el = getElementAt(editor.artifact, t.address);
            if (el && getElement(el.type)?.richText && (!isPhone() || already))
                startEditing(t.address, caret);
        }
    };

    const onContextMenu = (e: MouseEvent): void => {
        e.preventDefault();
        const t = hitTest(...point(e));
        setSelection(t);
        openContextMenu(e.clientX, e.clientY, t);
    };

    // the backdrop is the scroller itself: the gutters, top and bottom, not a section
    const onBackdropDblClick = (e: MouseEvent): void => {
        const bg = editor.artifact.background;
        if (e.target === scrollEl && bg?.kind === "image" && bg.image) pickArtifactBackground();
    };

    onMount(() => {
        setCanvasEl(scrollEl);
        setStageEl(stageEl);
        const ro = new ResizeObserver(() => scheduleDraw(null, false));
        ro.observe(scrollEl);
        // repaint only once the materialized band moves, so scrolling inside the overscan costs nothing
        const onScroll = (): void => {
            const viewH = scrollEl.clientHeight || 800;
            const now = performance.now();
            const dt = now - lastScrollAt;
            if (dt > 0 && lastScrollAt) velocity = (scrollEl.scrollTop - lastScrollTop) / dt;
            lastScrollTop = scrollEl.scrollTop;
            lastScrollAt = now;
            if (windowMoved(lastWindow, stackWindow(scrollEl.scrollTop, viewH), viewH))
                scheduleDraw(null, false);
            else if (pendingSections().size) scheduleFetch(viewH);
        };
        scrollEl.addEventListener("scroll", onScroll, { passive: true });
        onCleanup(() => {
            scrollEl.removeEventListener("scroll", onScroll);
            window.clearTimeout(settleTimer);
        });
        // drop the layer cache so the next draw measures with real font metrics, not the fallback face
        const onFonts = (): void => {
            stackCache.entries.clear();
            scheduleDraw(null, false);
        };
        document.fonts.ready.then(onFonts);
        document.fonts.addEventListener("loadingdone", onFonts);
        onCleanup(() => {
            ro.disconnect();
            document.fonts.removeEventListener("loadingdone", onFonts);
            if (rafId) cancelAnimationFrame(rafId);
        });
    });

    // element drags never reflow the canvas: the document stays frozen, insertion indicators
    // mark the slots, and the single mutation happens at drop
    const preview = createMemo<{ sections: Section[]; track: boolean; dimId?: string } | null>(
        () => {
            const edit = liveEdit();
            if (edit)
                return { sections: applyLiveEdit(editor.artifact, edit).sections, track: true };
            // a section reorder previews as a reflow into the slot, not a bare insertion line
            const sid = sectionDragId();
            const sd = sectionDrop();
            if (sid && sd !== null) {
                const secs = editor.artifact.sections;
                const i = secs.findIndex((s) => s.id === sid);
                const delta = (sd > i ? sd - 1 : sd) - i;
                const sections =
                    delta !== 0 ? moveSection(editor.artifact, sid, delta).sections : secs;
                return { sections, track: false, dimId: sid };
            }
            return null;
        },
    );

    // draw runs later in a rAF, outside tracking: read every repaint dep here or it won't redraw
    createEffect(() => {
        editSeq();
        currentArtifactId();
        leftOpen();
        editing();
        editorTokens();
        slideFrame();
        const p = preview();
        scheduleDraw(p?.sections ?? null, p?.track ?? false, p?.dimId ?? null);
    });

    // Slots enumerate once per gesture (the canvas doesn't reflow during an element drag) and
    // re-enumerate only when the canvas republishes regions underneath the drag — a scroll
    // materializing new windowed sections, AI streaming, a collaborative write.
    createEffect(() => {
        const d = drag();
        if (!d) {
            setDragSlots([]);
            return;
        }
        setDragSlots(computeDropSlots(editor.artifact, regions(), d.payload));
    });

    // the drag cursor can leave the canvas, so track it on the window
    const isDragging = createMemo(() => drag() !== null);
    createEffect(() => {
        if (!isDragging()) return;
        const move = (e: PointerEvent): void => {
            const [px, py] = point(e);
            setDrag((d) => {
                if (!d) return d;
                const slot = activeSlot(dragSlots(), px, py, d.target);
                return { ...d, x: e.clientX, y: e.clientY, target: slot?.target ?? null };
            });
        };
        const up = (): void => {
            const d = drag();
            endDrag(); // clear first so the redraw effect paints the committed result
            if (d?.target) {
                const res = applyDrop(editor.artifact, d.target, d.payload);
                commit(res.content);
                setSelection(res.address ? { kind: "element", address: res.address } : null);
                setHover(null);
            }
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        onCleanup(() => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        });
    });

    const pageStyle = createMemo(() => {
        const tk = editorTokens();
        const phonePad = profileFor(editor.artifact).bleedSections ? 0 : PHONE_PAD;
        return {
            background: backdropCss(editor.artifact.background, tk),
            "background-size": "cover",
            "background-position": "center",
            "padding-left": `${isPhone() ? phonePad : leftOpen() ? PANEL_L : RAIL_GAP}px`,
            "padding-right": `${isPhone() ? phonePad : RAIL_R}px`,
            "--sb": tk.line,
            "--sb-strong": tk.muted,
        };
    });

    return (
        <main
            ref={scrollEl}
            class="h-full overflow-y-auto overscroll-none pt-6 pb-35"
            style={pageStyle()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDblClick={onBackdropDblClick}
            onContextMenu={onContextMenu}
            onPointerLeave={() => !drag() && setHover(null)}
        >
            <div ref={stageEl} class="relative w-full">
                <div ref={paintHost} class="absolute inset-0" />
                <VideoEmbeds />
                <Overlay />
                <LiftVeil />
                <DropIndicators />
                {/* precision-pointer affordances; at phone width the reflowed layout no longer
                    matches the geometry they edit, so the section sheet + presets stand in */}
                <Show when={!isPhone()}>
                    <DragHandle />
                    <ResizeHandles />
                    <RegionDividers />
                    <SectionActions />
                </Show>
                <SectionGenStage />
                <SectionGenPopup />
                <ElementGenStage />
                <ContextBar />
                <EmptyRegionAdd />
                <TextEditor />
            </div>
            <ContextMenu />
        </main>
    );
};

const THUMB_PLACEHOLDER_H = 80; // box an un-laid-out thumb reserves for virtualization + reorder

export const Thumb: Component<{
    section: Section;
    index: number;
    root?: () => HTMLElement | undefined;
}> = (props) => {
    let wrap!: HTMLButtonElement;
    let inner!: HTMLDivElement;
    // lay out only once the thumb nears the rail; once seen it stays painted
    const [seen, setSeen] = createSignal(false);

    onMount(() => {
        wrap.style.height = `${THUMB_PLACEHOLDER_H}px`;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setSeen(true);
                    io.disconnect();
                }
            },
            { root: props.root?.() ?? null, rootMargin: "300px 0px" },
        );
        io.observe(wrap);
        onCleanup(() => io.disconnect());
    });

    createEffect(() => {
        if (!seen()) return;
        // lay out at the canvas width, then CSS-scale down, so the thumb is a true zoomed-out copy
        const theme = editorTokens();
        const profile = profileFor(editor.artifact);
        const layoutW = sectionLayoutWidth(props.section, profile, canvasContentWidth());
        const w = wrap.clientWidth || 150;
        const scale = w / layoutW;
        // mirrors the stack's mode, so the minimap is a true zoomed-out copy of what's on canvas
        const slide = slideFrame() && profile.kind === "paged";
        const { commands, height } = slide
            ? layoutSlide(
                  props.section,
                  layoutW,
                  sectionFrameHeight(props.section, profile, layoutW),
                  measureText,
                  theme,
                  profile,
              )
            : layoutSection(props.section, layoutW, measureText, theme, profile);
        inner.style.cssText = scaledHostCss(layoutW, height, scale);
        paint(commands, inner);
        wrap.style.height = `${Math.round(height * scale) + 2}px`;
    });

    return (
        <div class="flex items-center gap-2">
            <span class="w-3.5 shrink-0 text-right font-mono text-[10px] font-semibold leading-none text-muted">
                {props.index + 1}
            </span>
            <button
                ref={wrap}
                onClick={() => jumpToSection(props.index)}
                class="relative block min-w-0 flex-1 cursor-pointer overflow-hidden rounded-lg border border-line bg-canvas p-0 hover:border-accent"
            >
                <div ref={inner} />
            </button>
        </div>
    );
};

// addresses must mirror how compose tags region ids, so elementRegionId matches
function walkAddressed(
    section: Section,
    visit: (el: ElementInstance, addr: ElementAddress) => void,
): void {
    const recurse = (el: ElementInstance | undefined, addr: ElementAddress): void => {
        if (!el) return;
        visit(el, addr);
        const kids = (el.data as { children?: ElementInstance[] }).children;
        if (Array.isArray(kids))
            kids.forEach((k, i) => recurse(k, { ...addr, path: [...addr.path, i] }));
    };
    recurse(section.root, { section: section.id, path: [] });
}

const VideoEmbeds: Component = () => {
    // reuse the Embed when id, src and opts are unchanged, or <For> gets new refs and reloads players
    let cache = new Map<string, Embed>();
    const same = (a: PlayerOpts, b: PlayerOpts): boolean =>
        a.controls === b.controls &&
        a.autoplay === b.autoplay &&
        a.loop === b.loop &&
        a.muted === b.muted;
    const embeds = createMemo((): Embed[] => {
        const next = new Map<string, Embed>();
        const out: Embed[] = [];
        for (const section of editor.artifact.sections)
            walkAddressed(section, (el, addr) => {
                if (el.type !== "video") return;
                const d = el.data as { src?: string } & Partial<PlayerOpts>;
                const e = embedFor(d.src ?? "", d);
                if (!e) return;
                const id = elementRegionId(addr);
                const prev = cache.get(id);
                const item =
                    prev && prev.src === e.src && same(prev.opts, e.opts) ? prev : { id, ...e };
                next.set(id, item);
                out.push(item);
            });
        cache = next;
        return out;
    });
    const selected = (id: string): boolean => {
        const s = selection();
        return s?.kind === "element" && elementRegionId(s.address) === id;
    };
    return (
        <For each={embeds()}>
            {(embed) => {
                const region = createMemo(() => regions().find((r) => r.id === embed.id) ?? null);
                return (
                    <Show when={region()}>
                        {(r) => {
                            // interactive only when selected, so a click on an idle player selects it
                            const pe = (): "auto" | "none" =>
                                selected(embed.id) ? "auto" : "none";
                            return (
                                <div
                                    class="absolute overflow-hidden"
                                    style={{
                                        left: `${r().box.x}px`,
                                        top: `${r().box.y}px`,
                                        width: `${r().box.w}px`,
                                        height: `${r().box.h}px`,
                                        "border-radius": `${r().radius ?? 8}px`,
                                        "pointer-events": "none",
                                    }}
                                >
                                    <Show
                                        when={embed.kind === "iframe"}
                                        fallback={
                                            <video
                                                src={embed.src}
                                                controls={embed.opts.controls}
                                                autoplay={embed.opts.autoplay}
                                                loop={embed.opts.loop}
                                                muted={embed.opts.muted}
                                                playsinline
                                                class="h-full w-full bg-black object-cover"
                                                style={{ "pointer-events": pe() }}
                                            />
                                        }
                                    >
                                        <iframe
                                            src={embed.src}
                                            title="Embedded video"
                                            class="h-full w-full border-0 bg-black"
                                            style={{ "pointer-events": pe() }}
                                            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                            allowfullscreen
                                        />
                                    </Show>
                                </div>
                            );
                        }}
                    </Show>
                );
            }}
        </For>
    );
};
