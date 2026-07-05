import type { Region } from "@engine/node";
import type { Target } from "@model/target";
import type { Section } from "@model/artifact";
import type { Component } from "solid-js";
import { createEffect, createMemo, onCleanup, onMount } from "solid-js";
import { duplicateAt, duplicatedAddr, getElementAt, removeAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { resolveProfile } from "@engine/profile";
import { elementRegionId, parentTarget, parseTarget, specificity } from "@model/target";
import { backdropCss, paintSectionStack } from "@canvas/render/backends";
import { applyDrop, computeDropTarget, drag, previewDrop, setDrag, startDrag } from "../insert/dnd";
import { applyLiveEdit, liveEdit } from "../select/manipulate";
import {
    commit,
    currentArtifactId,
    duplicateSectionAt,
    editing,
    editor,
    editorTokens,
    editSeq,
    jumpToSection,
    leftOpen,
    redo,
    removeSectionAt,
    selection,
    setCanvasEl,
    setEditor,
    setHover,
    setRegions,
    setSelection,
    setStageEl,
    startEditing,
    stopEditing,
    undo,
} from "../editor";
import { CellAdd, ContextMenu, openContextMenu, DropIndicator } from "../insert/insert";
import { ColumnDividers, ResizeHandles, SpacingHandles } from "../select/handles";
import { ContextBar } from "../inspect/format-bar";
import { Overlay, SectionActions, SectionToolbar } from "../select/selection";
import { TextEditor } from "../text/text-editor";
import { VideoEmbeds } from "./embeds";

const DRAG_THRESHOLD = 4;

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
    let pending: { target: Target | null; x: number; y: number } | null = null;

    // `preview` (a modified copy of the sections) is painted while dragging: a ghost-spliced drop that
    // auto-sizes the section (DnD, `track` off — hit-testing stays on the stable real layout so the drop
    // target doesn't chase itself), or a live resize/column edit (`track` on — regions update so the
    // handles follow the element as it resizes).
    const draw = (preview?: Section[] | null, track = false): void => {
        if (!paintHost) return;
        // The panels float over the canvas; reserve their gutters so centered content clears them.
        const profile = resolveProfile(editor.artifact.format);
        const padL = leftOpen() ? PANEL_L : RAIL_GAP;
        const fullW = Math.max(360, (scrollEl.clientWidth || 800) - padL - RAIL_R);
        paintHost.replaceChildren();
        // suppress the painted text of the element being edited — only the live overlay shows it
        const editAddr = editing();
        const editId = editAddr ? elementRegionId(editAddr) : null;
        const { tops, regions, height } = paintSectionStack(
            paintHost,
            preview ?? editor.artifact.sections,
            profile,
            editorTokens(),
            { fullW, hideId: editId },
        );
        stageEl.style.height = `${height}px`;
        setEditor("sectionTops", tops);
        if (!preview || track) {
            liveRegions = regions;
            setRegions(regions);
        }
    };

    const point = (e: { clientX: number; clientY: number }): [number, number] => {
        const r = stageEl.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    };

    const hitTest = (px: number, py: number): Target | null => {
        let best: Target | null = null;
        let bestSpec = -1;
        for (const r of liveRegions) {
            const b = r.box;
            if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) continue;
            const t = parseTarget(r.id);
            if (t && specificity(t) > bestSpec) {
                bestSpec = specificity(t);
                best = t;
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
        if (drag() || editing() || liveEdit()) return; // active drag/resize driven by window listeners
        if (
            pending?.target?.kind === "element" &&
            Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > DRAG_THRESHOLD
        ) {
            const movedType = getElementAt(editor.artifact, pending.target.address)?.type;
            const label = (movedType && getElement(movedType)?.label) || "Move";
            startDrag({ kind: "move", from: pending.target.address }, e.clientX, e.clientY, label);
            pending = null;
            setHover(null);
            return;
        }
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
        const ro = new ResizeObserver(() => draw());
        ro.observe(scrollEl);
        // Web fonts arrive after first paint — re-measure once they (or a theme's font) finish loading.
        const onFonts = (): void => draw();
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
                    commit(removeAt(editor.artifact, sel.address));
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
        });
    });

    // The live preview painted mid-gesture: a resize/column edit (track on, so handles follow), or a
    // reflow drop ghost (track off). Null when nothing is being manipulated.
    const preview = createMemo<{ sections: Section[]; track: boolean } | null>(() => {
        const edit = liveEdit();
        if (edit) return { sections: applyLiveEdit(editor.artifact, edit).sections, track: true };
        const d = drag();
        if (d?.target?.reflow)
            return {
                sections: previewDrop(editor.artifact, d.target, d.payload).sections,
                track: false,
            };
        return null;
    });

    // editSeq() bumps on every edit; currentArtifactId() changes on load; preview() tracks the active
    // gesture — any of them forces a redraw (real artifact, or the live preview).
    createEffect(() => {
        editSeq();
        currentArtifactId();
        const p = preview();
        draw(p?.sections ?? null, p?.track ?? false);
    });

    // While a drag is active, the cursor lives anywhere on screen — track it on the window.
    const isDragging = createMemo(() => drag() !== null);
    createEffect(() => {
        if (!isDragging()) return;
        const move = (e: PointerEvent): void => {
            const target = computeDropTarget(liveRegions, ...point(e));
            setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, target } : d));
        };
        const up = (): void => {
            const d = drag();
            setDrag(null); // clear first so the redraw effect paints the committed result, not the ghost
            if (d?.target) {
                commit(applyDrop(editor.artifact, d.target, d.payload));
                setSelection({ kind: "cell", section: d.target.section, cell: d.target.cell });
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
                <ResizeHandles />
                <SpacingHandles />
                <ColumnDividers />
                <DropIndicator />
                <SectionActions />
                <SectionToolbar />
                <ContextBar />
                <CellAdd />
                <TextEditor />
            </div>
            <ContextMenu />
        </main>
    );
};
