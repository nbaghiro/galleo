import type { Region, Rect } from "@engine/node";
import type { Target } from "@model/target";
import type { Section } from "@model/artifact";
import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { getElementAt, moveSection } from "@elements/ops";
import { getElement } from "@elements/spec";
import { resolveProfile } from "@engine/profile";
import { elementRegionId, parseTarget, specificity } from "@model/target";
import {
    backdropCss,
    createSectionStackCache,
    paint,
    paintSectionStack,
    scaledHostCss,
    sectionLayoutWidth,
} from "@canvas/render/backends";
import { measureText, layoutSection } from "@canvas/render/commands";
import { applyDrop, computeDropTarget, drag, previewDrop, setDrag } from "./dnd";
import { applyLiveEdit, liveEdit, sectionDrop, sectionDragId } from "../select/handles";
import {
    canvasContentWidth,
    commit,
    currentArtifactId,
    editing,
    editor,
    editorTokens,
    editSeq,
    setCanvasContentWidth,
    jumpToSection,
    leftOpen,
    setCanvasEl,
    setHover,
    setRegions,
    setSectionTops,
    setSelection,
    setStageEl,
    startEditing,
    stopEditing,
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

const RAIL_GAP = 28;
const PANEL_L = 200;
const RAIL_R = 64;

export const Canvas: Component = () => {
    let scrollEl!: HTMLElement;
    let stageEl!: HTMLDivElement;
    let paintHost!: HTMLDivElement;

    let liveRegions: Region[] = [];
    // Precomputed per draw so hover is a numeric box test, not a re-parse of every region id.
    let liveHits: { target: Target; spec: number; box: Rect }[] = [];
    let pending: { target: Target | null; x: number; y: number } | null = null;

    // Cache so a frame re-lays-out only the changed section (see paintSectionStack).
    const stackCache = createSectionStackCache();

    // track off (DnD): hit-testing stays on the stable real layout so the drop target doesn't chase itself.
    // track on (resize/column): regions update so handles follow the element.
    const draw = (preview?: Section[] | null, track = false, dimId?: string | null): void => {
        if (!paintHost) return;
        const profile = resolveProfile(editor.artifact.format);
        const padL = leftOpen() ? PANEL_L : RAIL_GAP;
        const fullW = Math.max(360, (scrollEl.clientWidth || 800) - padL - RAIL_R);
        setCanvasContentWidth(fullW); // so minimap thumbnails match this width
        // hide the painted text of the edited element — the live overlay shows it
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

    // Coalesce draws to one paint per frame; latest queued state wins.
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
        // A pointerdown reaching here while editing is an OUTSIDE click (in-editor ones are stopped) —
        // record it so release can commit the current edit.
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
        // stopEditing first (idempotent — blur usually already committed) so clicking another text element
        // switches straight into editing it, caret at the click point.
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
        // On font load, drop the layer cache so the next draw re-lays-out with real metrics, not fallback-face ones.
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

    // A move drag previews for the whole gesture (source lifted out immediately); a new-from-palette drag
    // only once it has a target.
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
            // Section reorder: reflow the dragged section into its slot and dim it (not a bare insertion line).
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

    // draw runs later in a rAF (outside tracking) — read every repaint dep here synchronously or it won't redraw.
    createEffect(() => {
        editSeq();
        currentArtifactId();
        leftOpen();
        editing();
        editorTokens();
        const p = preview();
        scheduleDraw(p?.sections ?? null, p?.track ?? false, p?.dimId ?? null);
    });

    // Drag cursor can be anywhere on screen — track it on the window.
    const isDragging = createMemo(() => drag() !== null);
    createEffect(() => {
        if (!isDragging()) return;
        const move = (e: PointerEvent): void => {
            const target = computeDropTarget(editor.artifact, liveRegions, ...point(e));
            // Sticky target: keep the last valid one when the cursor is over a gutter/off-canvas, so the
            // preview doesn't flash back. Only a NEW valid target replaces it.
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

const THUMB_PLACEHOLDER_H = 80; // box an un-laid-out thumb reserves for virtualization + reorder

export const Thumb: Component<{
    section: Section;
    index: number;
    root?: () => HTMLElement | undefined;
}> = (props) => {
    let wrap!: HTMLButtonElement;
    let inner!: HTMLDivElement;
    // Defer layout until the thumb nears the rail (up-front layout of unseen thumbs is wasted). Once seen, stay painted.
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
        // Lay out at the canvas's real width + format, then CSS-scale down — a true zoomed-out copy, not a re-wrap in a narrower box.
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
