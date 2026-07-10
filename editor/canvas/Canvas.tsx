import type { Region, Rect } from "@engine/node";
import type { Target } from "@model/target";
import type { Section } from "@model/artifact";
import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
    deleteElement,
    duplicateAt,
    duplicatedAddr,
    getElementAt,
    moveSection,
} from "@elements/ops";
import { getElement } from "@elements/spec";
import { resolveProfile } from "@engine/profile";
import { elementRegionId, parentTarget, parseTarget, specificity } from "@model/target";
import {
    backdropCss,
    createSectionStackCache,
    paint,
    paintSectionStack,
    sectionLayoutWidth,
} from "@canvas/render/backends";
import { measureText, layoutSection } from "@canvas/render/commands";
import { scaledHostCss } from "@canvas/render/geometry";
import { applyDrop, computeDropTarget, drag, previewDrop, setDrag } from "./dnd";
import { applyLiveEdit, liveEdit, sectionDrop, sectionDragId } from "../select/handles";
import {
    canvasContentWidth,
    commit,
    currentArtifactId,
    duplicateSectionAt,
    editing,
    editor,
    editorTokens,
    editSeq,
    setCanvasContentWidth,
    jumpToSection,
    leftOpen,
    redo,
    removeSectionAt,
    selection,
    setCanvasEl,
    setHover,
    setRegions,
    setSectionTops,
    setSelection,
    setStageEl,
    startEditing,
    stopEditing,
    undo,
} from "../editor";
import { EmptyRegionAdd, ContextMenu, openContextMenu } from "./insert";
import { DragHandle, RegionDividers, ResizeHandles } from "../select/handles";
import { ContextBar } from "../inspect/format-bar";
import { Overlay, SectionActions, SectionToolbar } from "../select/selection";
import { SectionGenPopup } from "../ai/SectionGenPopup";
import { SectionGenStage } from "../ai/SectionGenStage";
import { ElementGenStage } from "../ai/ElementGenStage";
import { TextEditor } from "../text/text-editor";
import { VideoEmbeds } from "./embeds";

// Gutters reserved for the floating panels (so centered content clears them); collapsed → just a margin.
const RAIL_GAP = 28;
const PANEL_L = 200;
const RAIL_R = 64; // the right icon rail (the element flyout overlays content when opened)

// The continuous section canvas: lays out + paints each section, accumulates regions (canvas coords)
// for hit-testing, and drives selection + pointer-based drag-and-drop on top of the engine geometry.
export const Canvas: Component = () => {
    let scrollEl!: HTMLElement;
    let stageEl!: HTMLDivElement;
    let paintHost!: HTMLDivElement;

    let liveRegions: Region[] = [];
    // Hit-test data derived once per draw (parseTarget + specificity precomputed), so a hover mousemove
    // is a numeric box test over this array instead of re-parsing every region id on every move.
    let liveHits: { target: Target; spec: number; box: Rect }[] = [];
    let pending: { target: Target | null; x: number; y: number } | null = null;

    // Per-host layout+paint cache: unchanged sections reuse their laid-out layer across redraws, so a
    // gesture frame / keystroke re-lays-out only the one section that changed (see paintSectionStack).
    const stackCache = createSectionStackCache();

    // `preview` (a modified copy of the sections) is painted while dragging: a ghost-spliced drop that
    // auto-sizes the section (DnD, `track` off — hit-testing stays on the stable real layout so the drop
    // target doesn't chase itself), or a live resize/column edit (`track` on — regions update so the
    // handles follow the element as it resizes).
    const draw = (preview?: Section[] | null, track = false, dimId?: string | null): void => {
        if (!paintHost) return;
        // The panels float over the canvas; reserve their gutters so centered content clears them.
        const profile = resolveProfile(editor.artifact.format);
        const padL = leftOpen() ? PANEL_L : RAIL_GAP;
        const fullW = Math.max(360, (scrollEl.clientWidth || 800) - padL - RAIL_R);
        setCanvasContentWidth(fullW); // publish for the minimap so thumbnails match this exact width
        // suppress the painted text of the element being edited — only the live overlay shows it
        const editAddr = editing();
        const editId = editAddr ? elementRegionId(editAddr) : null;
        const { tops, regions, height } = paintSectionStack(
            paintHost,
            preview ?? editor.artifact.sections,
            profile,
            editorTokens(),
            { fullW, hideId: editId, dimId, cache: stackCache },
        );
        stageEl.style.height = `${height}px`;
        setSectionTops(tops);
        if (!preview || track) {
            liveRegions = regions;
            setRegions(regions);
            const hits: { target: Target; spec: number; box: Rect }[] = [];
            for (const r of regions) {
                const t = parseTarget(r.id);
                if (t) hits.push({ target: t, spec: specificity(t), box: r.box });
            }
            liveHits = hits;
        }
    };

    // Coalesce draw triggers to one paint per animation frame (a gesture fires many moves per frame); the
    // latest queued state wins.
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
        // In-editor clicks are stopped by the editor overlay, so any pointerdown that reaches here while
        // editing is an OUTSIDE click — record it so release can commit the current edit and act on it.
        if (drag() || liveEdit()) return;
        pending = { target: hitTest(...point(e)), x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent): void => {
        if (drag() || editing() || liveEdit() || sectionDrop() !== null) return; // driven by window listeners
        // Moving an element is initiated only from its drag handle (DragHandle) — not by dragging its body —
        // so ordinary clicks/selection never turn into an accidental move.
        setHover(hitTest(...point(e)));
    };

    const onPointerUp = (): void => {
        if (drag() || liveEdit() || !pending) return;
        const t = pending.target;
        const caret = { x: pending.x, y: pending.y };
        pending = null;
        // Clicking away from the active editor commits it first (its blur usually already has; this is the
        // idempotent fallback), then selection + edit-start run exactly as for a fresh click — so clicking
        // another text element while editing switches straight into editing it, caret at the click point.
        if (editing()) stopEditing();
        setSelection(t);
        if (t?.kind === "element") {
            const el = getElementAt(editor.artifact, t.address);
            if (el && getElement(el.type)?.richText) startEditing(t.address, caret);
        }
    };

    const onContextMenu = (e: MouseEvent): void => {
        e.preventDefault();
        const t = hitTest(...point(e));
        setSelection(t);
        openContextMenu(e.clientX, e.clientY, t);
    };

    onMount(() => {
        setCanvasEl(scrollEl);
        setStageEl(stageEl);
        const ro = new ResizeObserver(() => scheduleDraw(null, false));
        ro.observe(scrollEl);
        // Web fonts arrive after first paint — the shared measure cache self-invalidates on font load
        // (commands.ts); drop the per-section layer cache too so the next draw re-lays-out with the real
        // metrics instead of the fallback-face ones.
        const onFonts = (): void => {
            stackCache.entries.clear();
            scheduleDraw(null, false);
        };
        document.fonts.ready.then(onFonts);
        document.fonts.addEventListener("loadingdone", onFonts);
        const onKey = (e: KeyboardEvent): void => {
            if (editing()) return; // the inline editor owns the keyboard while active
            const el = document.activeElement as HTMLElement | null;
            const typing =
                !!el &&
                (el.tagName === "INPUT" ||
                    el.tagName === "TEXTAREA" ||
                    el.tagName === "SELECT" ||
                    el.isContentEditable);
            const sel = selection();
            if (e.key === "Escape") setSelection((cur) => (cur ? parentTarget(cur) : null));
            else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
                e.preventDefault();
                redo(); // Windows/alt redo
            } else if (typing) {
                return; // let inspector form fields own their keys (delete/backspace/etc.)
            } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
                e.preventDefault();
                if (sel.kind === "element") {
                    commit(deleteElement(editor.artifact, sel.address));
                    setSelection(null);
                } else if (sel.kind === "section") {
                    removeSectionAt(sel.section);
                }
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && sel) {
                e.preventDefault();
                if (sel.kind === "element") {
                    commit(duplicateAt(editor.artifact, sel.address));
                    setSelection({ kind: "element", address: duplicatedAddr(sel.address) });
                } else if (sel.kind === "section") {
                    duplicateSectionAt(sel.section);
                }
            } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && sel?.kind === "section") {
                e.preventDefault();
                const secs = editor.artifact.sections;
                const i = secs.findIndex((s) => s.id === sel.section);
                const j = Math.max(
                    0,
                    Math.min(secs.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)),
                );
                if (j !== i) {
                    setSelection({ kind: "section", section: secs[j]!.id });
                    jumpToSection(j);
                }
            }
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => {
            ro.disconnect();
            document.fonts.removeEventListener("loadingdone", onFonts);
            window.removeEventListener("keydown", onKey);
            if (rafId) cancelAnimationFrame(rafId);
        });
    });

    // The live preview painted mid-gesture: a resize/column edit (track on, so handles follow), or a
    // drop ghost (track off). Null when nothing is being manipulated. A MOVE drag previews for the whole
    // gesture even before it has a target — previewDrop lifts the source out immediately (so the element
    // leaves its old spot and stays gone); a new-from-palette drag only previews once it has a target.
    const preview = createMemo<{ sections: Section[]; track: boolean; dimId?: string } | null>(
        () => {
            const edit = liveEdit();
            if (edit)
                return { sections: applyLiveEdit(editor.artifact, edit).sections, track: true };
            const d = drag();
            if (d && (d.payload.kind === "move" || d.target))
                return {
                    sections: previewDrop(editor.artifact, d.target, d.payload).sections,
                    track: false,
                };
            // Section drag-reorder: reflow the dragged section into its drop slot and dim it, so it reads
            // like the lifted element preview instead of a bare insertion line.
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

    // The draw runs later in a rAF (outside tracking), so every dep that must force a repaint is read
    // here synchronously — omitting one silently stops it from triggering redraws.
    createEffect(() => {
        editSeq();
        currentArtifactId();
        leftOpen();
        editing();
        editorTokens();
        const p = preview();
        scheduleDraw(p?.sections ?? null, p?.track ?? false, p?.dimId ?? null);
    });

    // While a drag is active, the cursor lives anywhere on screen — track it on the window.
    const isDragging = createMemo(() => drag() !== null);
    createEffect(() => {
        if (!isDragging()) return;
        const move = (e: PointerEvent): void => {
            const target = computeDropTarget(editor.artifact, liveRegions, ...point(e));
            // Sticky target: keep the last valid drop target when the cursor is momentarily over a gutter,
            // between sections, or off-canvas (target === null), so the preview doesn't flash back to the
            // lifted-only layout. Only a NEW valid target replaces it; it resets when the drag ends.
            setDrag((d) =>
                d ? { ...d, x: e.clientX, y: e.clientY, target: target ?? d.target } : d,
            );
        };
        const up = (): void => {
            const d = drag();
            setDrag(null); // clear first so the redraw effect paints the committed result, not the ghost
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
        return {
            background: backdropCss(editor.artifact.background, tk),
            "background-size": "cover",
            "background-position": "center",
            "padding-left": `${leftOpen() ? PANEL_L : RAIL_GAP}px`,
            "padding-right": `${RAIL_R}px`,
            "--sb": tk.line,
            "--sb-strong": tk.muted,
        };
    });

    return (
        <main
            ref={scrollEl}
            class="h-full overflow-y-auto overscroll-none pt-6 pb-[140px]"
            style={pageStyle()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onContextMenu={onContextMenu}
            onPointerLeave={() => !drag() && setHover(null)}
        >
            <div ref={stageEl} class="relative w-full">
                <div ref={paintHost} class="absolute inset-0" />
                <VideoEmbeds />
                <Overlay />
                <DragHandle />
                <ResizeHandles />
                <RegionDividers />
                <SectionActions />
                <SectionToolbar />
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

// ── section thumbnail (rendered in the Minimap rail) ──
const THUMB_PLACEHOLDER_H = 80; // height an un-laid-out (offscreen) thumb reserves so virtualization + reorder have a box

export const Thumb: Component<{
    section: Section;
    index: number;
    root?: () => HTMLElement | undefined;
}> = (props) => {
    let wrap!: HTMLButtonElement;
    let inner!: HTMLDivElement;
    // Defer layout until the thumbnail scrolls near the rail — laying out every section up front (and
    // again on each theme change) is wasted for thumbs never viewed. Once seen, stay painted.
    const [seen, setSeen] = createSignal(false);

    onMount(() => {
        wrap.style.height = `${THUMB_PLACEHOLDER_H}px`; // a box for IO/reorder until this thumb is laid out
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
        // Lay out at the SAME width + format the editor canvas uses for this section, then CSS-scale the
        // whole thing down to the rail. A true zoomed-out copy — identical text wraps + column behavior,
        // not a re-wrap in a narrower box. Tracks the live canvas width so it stays matched on resize.
        const theme = editorTokens();
        const profile = resolveProfile(editor.artifact.format);
        const layoutW = sectionLayoutWidth(props.section, profile, canvasContentWidth());
        const w = wrap.clientWidth || 150;
        const scale = w / layoutW;
        const { commands, height } = layoutSection(
            props.section,
            layoutW,
            measureText,
            theme,
            profile,
        );
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
