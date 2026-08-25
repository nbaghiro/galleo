import { asFormat, RENDER_SLOW_MS } from "@model/analytics";
import { capture } from "@ui/analytics";
import type { Rect, Region } from "@engine/node";
import type { Tokens } from "@themes";
import { inRegion } from "@engine/node";
import { pickArtifactBackground } from "./core/media";
import type { ElementAddress, Target, Section } from "@model/artifact";
import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { applyAffordance, getElementAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { profileFor } from "@engine/profile";
import {
    contentRegionId,
    elementRegionId,
    parseDatumRegion,
    parseHitRegion,
    parseTarget,
    sectionLinkId,
    specificity,
    targetsEqual,
} from "@model/artifact";
import { isCoarsePointer, isPhone } from "@ui/viewport";
import type { CollabCursor, ElementRef } from "@model/collab";
import {
    backdropCss,
    createSectionStackCache,
    offsetRegion,
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
import { measureText, layoutNode, layoutSection, layoutSlide } from "@canvas/render/commands";
import { openPopups, panelFor } from "./core/leaf";
import { openDataEditor } from "./panels/DataEditor";
import {
    activeSlot,
    applyDrop,
    computeDropSlots,
    drag,
    dragSlots,
    endDrag,
    movableAncestor,
    setDrag,
    setDragSlots,
} from "./core/dnd";
import { applyLiveEdit, liveEdit } from "./panels/Selection";
import {
    canvasContentWidth,
    commit,
    currentArtifactId,
    editSeq,
    editing,
    editor,
    editorTokens,
    fitFreeze,
    jumpToSection,
    knownHeight,
    leftOpen,
    minimapWidth,
    noteElementAdded,
    noteElementMoved,
    pending as pendingSections,
    presenting,
    regions,
    rememberHeight,
    requestSections,
    selection,
    setCanvasContentWidth,
    setCanvasEl,
    setDatum,
    setHover,
    setRegions,
    setSectionFits,
    setSectionTops,
    setSelection,
    noteDropSelection,
    selectMany,
    setStageEl,
    slideFrame,
    startEditing,
    stopEditing,
    toStage,
    toggleExtra,
    zoom,
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
import { CommentLayer } from "./panels/Comments";
import { CollabLayer, CollabViewportChrome } from "./panels/Collab";
import { LiveLayer } from "@ui/live";
import { collabActive, cursorForPoint, elementRefFor, sendPresence } from "./core/collab";

const RAIL_GAP = 28;
// the rail's own left offset (left-3) plus a little air between it and the first section
const PANEL_L_GAP = 18;
const RAIL_R = 64;
const panelL = (): number => minimapWidth() + PANEL_L_GAP;
// phone: no rails to clear — a sliver of gutter, sections take essentially the full width
const PHONE_PAD = 6;

const PANEL_GAP = 8; // between a popup's trigger and its floating panel
const PANEL_EDGE = 12; // slack the panel keeps from the stage edge
// A floating panel covers whatever it is over, so its regions outrank them however deep those sit;
// hit-testing resolves by specificity, not by paint order.
const PANEL_SPEC = 100;

export const Canvas: Component = () => {
    let scrollEl!: HTMLElement;
    let stageEl!: HTMLDivElement;
    let paintHost!: HTMLDivElement;
    let panelHost!: HTMLDivElement;

    // The laid-out stack's height, in layout coordinates. The sizer around the stage carries the
    // zoomed height, which is what gives the scroller its true range at any zoom.
    const [stackHeight, setStackHeight] = createSignal(0);

    // The scroller is unscaled and the stage inside it is not, so anything the scroller reports has
    // to divide the zoom out before it is compared against tops, slots or the paint window.
    const layoutScrollTop = (): number => scrollEl.scrollTop / zoom();
    const layoutViewH = (): number => (scrollEl.clientHeight || 800) / zoom();

    // Precomputed per draw so hover is a numeric box test, not a re-parse of every region id.
    let liveHits: { target: Target; spec: number; box: Rect }[] = [];
    let affordances: { action: string; address: ElementAddress; box: Rect }[] = [];
    // sub-element marks (a chart's bars): hover-only, and shape-aware where a box would lie
    let datums: Region[] = [];
    let pending: { target: Target | null; x: number; y: number } | null = null;
    // an affordance press (a checklist's checkbox) acts on release and never becomes a selection
    let pendingAffordance: { action: string; address: ElementAddress; box: Rect } | null = null;
    let pendingDatum: string | null = null;

    // so a frame re-lays-out only the changed section (see paintSectionStack)
    const stackCache = createSectionStackCache();

    // One host per open popup, keyed by its region id, holding what that paint was made of so a
    // draw that changed nothing costs nothing.
    interface PanelEntry {
        el: HTMLDivElement;
        data: unknown;
        section: Section; // its own contrast swap, so a dark band repaints the panel
        theme: Tokens;
        key: string; // what the compose depends on beyond those: profile, width, hidden text
        width: number;
        regions: Region[];
        height: number;
    }
    const panels = new Map<string, PanelEntry>();

    const insidePanel = (popup: ElementAddress, addr: ElementAddress): boolean =>
        addr.section === popup.section &&
        addr.path.length > popup.path.length &&
        popup.path.every((v, i) => v === addr.path[i]);

    /**
     * Every open popup's panel, painted over the stack and reported as ordinary regions. That is
     * what gives the panel selection rings, hover, drop slots, the context menu, comments and
     * inline text editing with no per-feature code: they all read the regions the canvas publishes.
     */
    const drawPanels = (
        regions: Region[],
        profileId: string,
        editAddr: ElementAddress | null,
    ): Region[] => {
        const open = openPopups();
        if (!open.length && !panels.size) return [];
        const stageW = stageEl.clientWidth || canvasContentWidth();
        // the visible band in stage coordinates, which the stack's gutter offsets from the
        // scroller's; the stage rect carries the zoom, so the band divides back out of it
        const z = zoom();
        const stageTop = stageEl.getBoundingClientRect().top;
        const view = scrollEl.getBoundingClientRect();
        const viewTop = (view.top - stageTop) / z;
        const viewBottom = (view.bottom - stageTop) / z;
        const theme = editorTokens();
        const out: Region[] = [];
        const live = new Set<string>();
        for (const address of open) {
            const id = elementRegionId(address);
            const anchor = regions.find((r) => r.id === id)?.box;
            if (!anchor) continue; // windowed out of the stack: nothing to anchor to
            const inst = getElementAt(editor.artifact, address);
            const section = editor.artifact.sections.find((s) => s.id === address.section);
            if (!inst || !section) continue;
            // the stack painter hides the edited element's text under the inline editor; a panel
            // child is edited the same way, so its own paint has to hide it too
            const hideKey =
                editAddr && insidePanel(address, editAddr) ? elementRegionId(editAddr) : "";
            const key = `${profileId}:${canvasContentWidth()}:${hideKey}`;
            let entry = panels.get(id);
            if (
                !entry ||
                entry.data !== inst.data ||
                entry.section !== section ||
                entry.theme !== theme ||
                entry.key !== key
            ) {
                const panel = panelFor(address);
                if (!panel) continue;
                const laid = layoutNode(panel.node, panel.width, measureText);
                const paintedW = laid.commands[0]?.box.w ?? panel.width;
                const commands = hideKey
                    ? laid.commands.filter((c) => !(c.kind === "text" && c.id === hideKey))
                    : laid.commands;
                const el = entry?.el ?? document.createElement("div");
                paint(commands, el);
                if (el.parentElement !== panelHost) panelHost.appendChild(el);
                entry = {
                    el,
                    data: inst.data,
                    section,
                    theme,
                    key,
                    width: paintedW,
                    regions: laid.regions,
                    height: laid.height,
                };
                panels.set(id, entry);
            }
            live.add(id);
            // under the trigger, flipped above when it would run off the bottom of the viewport
            const x = Math.max(PANEL_EDGE, Math.min(anchor.x, stageW - entry.width - PANEL_EDGE));
            const below = anchor.y + anchor.h + PANEL_GAP;
            const above = anchor.y - PANEL_GAP - entry.height;
            const y = below + entry.height > viewBottom && above >= viewTop ? above : below;
            // paint() forces relative on its host, so the float is (re)stated after it, not before
            entry.el.style.position = "absolute";
            entry.el.style.pointerEvents = "auto";
            entry.el.style.left = `${x}px`;
            entry.el.style.top = `${y}px`;
            entry.el.style.width = `${entry.width}px`;
            entry.el.style.height = `${entry.height}px`;
            // the box the panel's children occupy, so drop slots aim at the panel and not the chip
            out.push({
                id: contentRegionId(address),
                box: { x, y, w: entry.width, h: entry.height },
            });
            for (const r of entry.regions) out.push(offsetRegion(r, x, y));
        }
        for (const [id, entry] of panels)
            if (!live.has(id)) {
                entry.el.remove();
                panels.delete(id);
            }
        return out;
    };

    // the band of the stage that is materialized
    let lastWindow: StackWindow | null = null;

    // track: regions follow the preview (resize/column); off for DnD, so the drop target holds still
    const draw = (preview?: Section[] | null, track = false, dimId?: string | null): void => {
        if (!paintHost) return;
        const profile = profileFor(editor.artifact);
        // a bleeding format (site) covers the backdrop entirely on phone; others keep the sliver
        const phonePad = profile.bleedSections ? 0 : PHONE_PAD;
        const padL = isPhone() ? phonePad : leftOpen() ? panelL() : RAIL_GAP;
        const padR = isPhone() ? phonePad : RAIL_R;
        const fullW = Math.max(isPhone() ? 280 : 360, (scrollEl.clientWidth || 800) - padL - padR);
        setCanvasContentWidth(fullW); // so minimap thumbnails match this width
        // hide the painted text of the edited element; the live overlay shows it
        const editAddr = editing();
        const editId = editAddr ? elementRegionId(editAddr) : null;
        // the window is layout geometry, so the scrolled band divides the zoom back out
        const viewH = layoutViewH();
        const win = stackWindow(layoutScrollTop(), viewH);
        lastWindow = win;
        const waiting = pendingSections();
        const beforeTops = editor.sectionTops;
        const paintStartedAt = performance.now();
        const { tops, heights, fitScales, regions, height } = paintSectionStack(
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
                freezeFit: fitFreeze(),
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
        // Above a measured bound, not on every paint: the engine solves layout from text metrics on
        // every visible section, so a slow one is a real user-visible cost worth knowing about.
        const paintMs = performance.now() - paintStartedAt;
        if (paintMs > RENDER_SLOW_MS)
            capture("render_slow", {
                ms: Math.round(paintMs),
                section_count: editor.artifact.sections.length,
                format: asFormat(editor.artifact.format),
                where: presenting() ? "present" : "editor",
            });
        setStackHeight(height);
        const drawn = preview ?? editor.artifact.sections;
        for (const [i, sec] of drawn.entries())
            if (!waiting.has(sec.id)) rememberHeight(sec.id, fullW, heights[i] ?? 0);
        // a loaded section rarely matches its estimate; absorb the difference to hold the reader's place
        anchorScroll(beforeTops, tops);
        setSectionTops(tops);
        setSectionFits(fitScales);
        // fetching runs on its own clock (see scheduleFetch): painting must never wait on the network
        if (waiting.size) scheduleFetch(viewH);
        if (!preview || track) {
            const panelRegions = drawPanels(regions, profile.id, editAddr);
            setRegions(panelRegions.length ? [...regions, ...panelRegions] : regions);
            const hits: { target: Target; spec: number; box: Rect }[] = [];
            const aff: { action: string; address: ElementAddress; box: Rect }[] = [];
            const marks: Region[] = [];
            const collect = (list: Region[], boost: number): void => {
                for (const r of list) {
                    const t = parseTarget(r.id);
                    if (t) hits.push({ target: t, spec: specificity(t) + boost, box: r.box });
                    const h = parseHitRegion(r.id);
                    if (h) aff.push({ ...h, box: r.box });
                    if (parseDatumRegion(r.id)) marks.push(r);
                }
            };
            collect(regions, 0);
            collect(panelRegions, PANEL_SPEC);
            liveHits = hits;
            affordances = aff;
            datums = marks;
        }
    };

    const anchorScroll = (before: number[], after: number[]): void => {
        if (before.length !== after.length) return;
        const top = layoutScrollTop();
        let shift = 0;
        for (let i = 0; i < before.length; i++) {
            if (before[i]! >= top) break; // only what sat above the viewport can move it
            shift = after[i]! - before[i]!;
        }
        // the shift is layout px; the scroller moves in zoomed ones
        if (shift) scrollEl.scrollTop += shift * zoom();
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
        const top = layoutScrollTop();
        const view = { top, bottom: top + viewH };
        const lead = prefetch ? Math.sign(velocity || 1) * viewH : 0;
        const want = planSectionRequests({ slots: slotsNow(), view, lead, max: PREFETCH_MAX });
        if (want.length) void requestSections(want);
    };

    const scheduleFetch = (viewH: number): void => {
        const top = layoutScrollTop();
        const view = { top, bottom: top + viewH };
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

    const point = (e: { clientX: number; clientY: number }): [number, number] =>
        toStage(stageEl.getBoundingClientRect(), zoom(), e.clientX, e.clientY);

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

    const inBox = (b: Rect, px: number, py: number): boolean =>
        px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;

    const within = (inner: Rect, outer: Rect): boolean =>
        inner.x >= outer.x - 0.5 &&
        inner.y >= outer.y - 0.5 &&
        inner.x + inner.w <= outer.x + outer.w + 0.5 &&
        inner.y + inner.h <= outer.y + outer.h + 0.5 &&
        (inner.w < outer.w - 0.5 || inner.h < outer.h - 0.5);

    // An affordance yields to anything selectable sitting inside it, so an author still clicks into
    // the question text of a collapsible row that a reader presses to open.
    const affordanceAt = (
        px: number,
        py: number,
    ): { action: string; address: ElementAddress; box: Rect } | null => {
        const a = affordances.find((x) => inBox(x.box, px, py));
        if (!a) return null;
        return liveHits.some((h) => inBox(h.box, px, py) && within(h.box, a.box)) ? null : a;
    };

    // last painted wins: emit reports a parent before its children, and marks overlap (a bubble chart)
    const datumAt = (px: number, py: number): string | null => {
        for (let i = datums.length - 1; i >= 0; i--)
            if (inRegion(datums[i]!, px, py)) return datums[i]!.id;
        return null;
    };

    const ownerOf = (id: string): ElementAddress | null => {
        const el = parseDatumRegion(id)?.element;
        const t = el ? parseTarget(el) : null;
        return t?.kind === "element" ? t.address : null;
    };

    const runAffordance = (a: { action: string; address: ElementAddress }): void => {
        const next = applyAffordance(editor.artifact, a.action, a.address);
        if (next !== editor.artifact) commit(next);
    };

    const onPointerDown = (e: PointerEvent): void => {
        // a pointerdown reaching here while editing is an outside click; in-editor ones are stopped
        if (drag() || liveEdit()) return;
        // shift means structural selection: without this the browser extends a native text range
        // from the overlay caret to the click point, smearing highlight across painted spans
        if (e.shiftKey && !isPhone()) e.preventDefault();
        pendingAffordance = affordanceAt(...point(e));
        if (pendingAffordance) {
            pending = null;
            return;
        }
        pendingDatum = datumAt(...point(e));
        pending = { target: hitTest(...point(e)), x: e.clientX, y: e.clientY };
    };

    // Presence, in content terms: the room is told which element the pointer is over and how far
    // across it, never where it is on this screen. A coarse pointer has no meaningful hover
    // position, so those clients render remote cursors without ever sending one.
    let lastCursor: CollabCursor | null = null;
    const refOf = (t: Target | null): ElementRef | null =>
        t?.kind === "element" ? elementRefFor(t.address) : null;
    const publishPresence = (): void => {
        if (!collabActive()) return;
        sendPresence({
            cursor: lastCursor,
            selection: refOf(selection()),
            editing: refOf(editing() ? { kind: "element", address: editing()! } : null),
        });
    };
    createEffect(() => {
        selection();
        editing();
        publishPresence();
    });

    const onPointerMove = (e: PointerEvent): void => {
        if (collabActive() && !isCoarsePointer()) {
            const [px, py] = point(e);
            lastCursor = cursorForPoint({ x: px, y: py }, hitTest(px, py));
            publishPresence();
        }
        if (drag() || editing() || liveEdit()) return; // driven by window listeners
        // Moves start only from the DragHandle, so a body drag never becomes an accidental move.
        const [hx, hy] = point(e);
        setHover(hitTest(hx, hy));
        setDatum(datumAt(hx, hy));
        scrollEl.style.cursor = affordanceAt(hx, hy) ? "pointer" : "";
    };

    const onPointerLeaveCanvas = (): void => {
        if (!drag()) setHover(null);
        setDatum(null);
        if (lastCursor === null) return;
        lastCursor = null;
        publishPresence();
    };

    const onPointerUp = (e: PointerEvent): void => {
        if (pendingAffordance) {
            const a = pendingAffordance;
            pendingAffordance = null;
            if (!drag() && !liveEdit()) runAffordance(a);
            return;
        }
        if (drag() || liveEdit() || !pending) {
            pendingDatum = null;
            return;
        }
        const t = pending.target;
        const caret = { x: pending.x, y: pending.y };
        const datumHit =
            pendingDatum && pendingDatum === datumAt(...point(e)) ? pendingDatum : null;
        pendingDatum = null;
        pending = null;
        // Shift extends the set (desktop only: the phone path shares this handler and has no shift).
        // It aims at the movable ancestor, like the drag grip, so a part of a unit adds the unit.
        if (e.shiftKey && !isPhone() && t?.kind === "element") {
            if (editing()) stopEditing();
            document.getSelection()?.removeAllRanges();
            toggleExtra(movableAncestor(editor.artifact, t.address));
            return;
        }
        // phone: first tap only selects — editing (and the keyboard) waits for a tap on the
        // already-selected text, so browsing a document never summons the keyboard
        const already = targetsEqual(t, selection());
        // stop editing first (idempotent) so a click on another text element switches straight into it
        if (editing()) stopEditing();
        setSelection(t);
        // a mark is not a selection target: the click selects the chart, and the grid is where its
        // numbers are edited, so landing on a bar goes straight there. The mark names its own owner,
        // which is the element to open even where the topmost hit is something stacked over it.
        const owner = datumHit && ownerOf(datumHit);
        if (owner) {
            openDataEditor(owner);
            return;
        }
        if (t?.kind === "element") {
            const el = getElementAt(editor.artifact, t.address);
            if (el && getElement(el.type)?.richText && (!isPhone() || already))
                startEditing(t.address, caret);
        }
    };

    // the live overlay only turns interactive for the element the author has selected
    const selectedRegionId = createMemo((): string | null => {
        const s = selection();
        return s?.kind === "element" ? elementRegionId(s.address) : null;
    });

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
        // on canvas a click selects; cmd/ctrl-click follows the link, as design tools do
        const onLinkClick = (e: MouseEvent): void => {
            const a = (e.target as HTMLElement | null)?.closest("a");
            if (!a) return;
            const id = sectionLinkId(a.getAttribute("href"));
            // a `#section` link has nowhere to navigate on the canvas, so it never gets to try;
            // cmd-click follows it the only way it can, by scrolling to the section
            if (id) {
                e.preventDefault();
                const at = editor.artifact.sections.findIndex((s) => s.id === id);
                if ((e.metaKey || e.ctrlKey) && at >= 0) jumpToSection(at);
                return;
            }
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
        };
        paintHost.addEventListener("click", onLinkClick, true);
        panelHost.addEventListener("click", onLinkClick, true);
        onCleanup(() => {
            paintHost.removeEventListener("click", onLinkClick, true);
            panelHost.removeEventListener("click", onLinkClick, true);
        });
        const ro = new ResizeObserver(() => scheduleDraw(null, false));
        ro.observe(scrollEl);
        // repaint only once the materialized band moves, so scrolling inside the overscan costs nothing
        const onScroll = (): void => {
            const viewH = layoutViewH();
            const top = layoutScrollTop();
            const now = performance.now();
            const dt = now - lastScrollAt;
            if (dt > 0 && lastScrollAt) velocity = (top - lastScrollTop) / dt;
            lastScrollTop = top;
            lastScrollAt = now;
            if (windowMoved(lastWindow, stackWindow(top, viewH), viewH)) scheduleDraw(null, false);
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

    // element and section drags never reflow the canvas: the document stays frozen, insertion
    // indicators mark the slots, and the single mutation happens at drop
    const preview = createMemo<{ sections: Section[]; track: boolean; dimId?: string } | null>(
        () => {
            const edit = liveEdit();
            if (edit)
                return { sections: applyLiveEdit(editor.artifact, edit).sections, track: true };
            return null;
        },
    );

    // draw runs later in a rAF, outside tracking: read every repaint dep here or it won't redraw
    createEffect(() => {
        editSeq();
        currentArtifactId();
        leftOpen();
        minimapWidth(); // the rail's width is what the canvas reserves on the left
        zoom(); // the paint window is measured in layout px, so the scale moves its edges
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
        let clientX = drag()?.x ?? 0;
        let clientY = drag()?.y ?? 0;
        const retarget = (): void => {
            const [px, py] = point({ clientX, clientY });
            setDrag((d) => {
                if (!d) return d;
                const slot = activeSlot(dragSlots(), px, py, d.target);
                return { ...d, x: clientX, y: clientY, target: slot?.target ?? null };
            });
        };
        const move = (e: PointerEvent): void => {
            clientX = e.clientX;
            clientY = e.clientY;
            retarget();
        };
        // The canvas is frozen during a drag, so reaching a distant slot means scrolling the
        // stack under the pointer: holding near the viewport edge scrolls, speed by proximity.
        // The window effect repaints as the band moves, regions republish, slots re-enumerate.
        const EDGE_ZONE = 56;
        const MAX_STEP = 16; // px per frame
        let scrollRaf = requestAnimationFrame(function autoscroll() {
            scrollRaf = requestAnimationFrame(autoscroll);
            const r = scrollEl.getBoundingClientRect();
            const up = r.top + EDGE_ZONE - clientY;
            const down = clientY - (r.bottom - EDGE_ZONE);
            const step =
                up > 0
                    ? -Math.min(MAX_STEP, (up / EDGE_ZONE) * MAX_STEP)
                    : down > 0
                      ? Math.min(MAX_STEP, (down / EDGE_ZONE) * MAX_STEP)
                      : 0;
            if (!step) return;
            const before = scrollEl.scrollTop;
            scrollEl.scrollTop += step;
            if (scrollEl.scrollTop !== before) retarget(); // content moved under the pointer
        });
        const up = (): void => {
            const d = drag();
            endDrag(); // clear first so the redraw effect paints the committed result
            if (d?.target) {
                const before = editor.artifact;
                const block = d.payload.kind === "moveMany" ? d.payload : null;
                const source =
                    d.payload.kind === "move"
                        ? d.payload.from
                        : block
                          ? {
                                section: block.parent.section,
                                path: [...block.parent.path, block.indices[0] ?? 0],
                            }
                          : null;
                const moving = source ? getElementAt(before, source)?.type : undefined;
                const res = applyDrop(before, d.target, d.payload);
                if (res.content !== before) {
                    commit(res.content);
                    if (d.payload.kind === "new") noteElementAdded(d.payload.type, "drag");
                    else if (moving !== undefined)
                        noteElementMoved(moving, source?.section === d.target.section);
                }
                noteDropSelection(); // the flyout must not open over what was just dropped
                const landed = res.address;
                if (block && landed && res.content !== before) {
                    // the block landed contiguously, so the whole set survives the drop
                    const head = landed.path[landed.path.length - 1] ?? 0;
                    selectMany(
                        block.indices.map((_, i) => ({
                            section: landed.section,
                            path: [...landed.path.slice(0, -1), head + i],
                        })),
                    );
                } else
                    setSelection(
                        d.payload.kind === "section"
                            ? { kind: "section", section: d.payload.id }
                            : res.address
                              ? { kind: "element", address: res.address }
                              : null,
                    );
                setHover(null);
            }
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        onCleanup(() => {
            cancelAnimationFrame(scrollRaf);
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
            "padding-left": `${isPhone() ? phonePad : leftOpen() ? panelL() : RAIL_GAP}px`,
            "padding-right": `${isPhone() ? phonePad : RAIL_R}px`,
            "--sb": tk.line,
            "--sb-strong": tk.muted,
        };
    });

    return (
        <main
            ref={scrollEl}
            // the floating chrome sits over this scroller, so the last section needs room to clear it
            class="h-full overflow-y-auto overscroll-none pb-35 pt-6"
            style={pageStyle()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDblClick={onBackdropDblClick}
            onContextMenu={onContextMenu}
            onPointerLeave={onPointerLeaveCanvas}
        >
            {/* The sizer carries the zoomed footprint, so the scroller's range reaches the true
                bottom (and leaves no dead space below 100%). The stage inside it keeps its unscaled
                layout width, which is what makes zoom a pure view scale: nothing re-wraps, and every
                overlay below is an absolutely positioned child that rides the transform for free.
                Centred only while it fits: auto margins go NEGATIVE on a box wider than its
                container, and scrollable overflow never extends leftwards, so centring past 100%
                would put the left of the stack somewhere no scroll position can reach. */}
            <div
                class="relative"
                classList={{ "mx-auto": zoom() <= 1 }}
                style={{
                    width: `${zoom() * 100}%`,
                    height: `${stackHeight() * zoom()}px`,
                }}
            >
                <div
                    ref={stageEl}
                    class="absolute left-0 top-0 origin-top-left"
                    style={{
                        width: `${100 / zoom()}%`,
                        height: `${stackHeight()}px`,
                        transform: `scale(${zoom()})`,
                    }}
                >
                    <div ref={paintHost} class="absolute inset-0 select-none" />
                    {/* popup panels float over the stack: after paintHost so they cover it, before
                        the chrome below (which carries a z-* utility) so nothing of the editor is
                        buried. Only the panels take the pointer, so the bare stage stays clickable */}
                    <div ref={panelHost} class="pointer-events-none absolute inset-0 select-none" />
                    <LiveLayer
                        content={editor.artifact}
                        regions={regions}
                        surface="editor"
                        theme={editorTokens()}
                        format={profileFor(editor.artifact)}
                        selectedId={selectedRegionId}
                    />
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
                    <CommentLayer />
                    <CollabLayer />
                    <EmptyRegionAdd />
                    <TextEditor />
                </div>
            </div>
            {/* viewport-fixed, so it must stay outside the stage: a transformed ancestor would make
                it a containing block and the zoom would drag both off the viewport */}
            <CollabViewportChrome />
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
        // the rail's width is measured off `wrap`, so nothing here tracks it: read it so a resize
        // re-lays-out even where the canvas width stayed put (it clamps at its own floor)
        minimapWidth();
        const w = wrap.clientWidth || 150;
        const scale = w / layoutW;
        // mirrors the stack's mode, so the minimap is a true zoomed-out copy of what's on canvas
        const slide = slideFrame() && profile.kind === "paged";
        const held = fitFreeze();
        const { commands, height } = slide
            ? layoutSlide(
                  props.section,
                  layoutW,
                  sectionFrameHeight(props.section, profile, layoutW),
                  measureText,
                  theme,
                  profile,
                  false,
                  held?.id === props.section.id ? held.scale : undefined,
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
