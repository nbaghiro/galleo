import type { Region } from "@engine/render-command";
import type { Target } from "@model/address";
import type { Component } from "solid-js";
import { createEffect, createMemo, onCleanup, onMount } from "solid-js";
import { getElementAt } from "@elements/ops";
import { getElement } from "@elements/registry";
import { resolveProfile } from "@engine/profile";
import { elementRegionId, parentTarget, parseTarget, specificity } from "@model/address";
import { resolveTheme } from "@themes/library";
import { backdropCss } from "./backdrop";
import { paint } from "./dom-backend";
import { applyDrop, computeDropTarget, drag, setDrag, startDrag } from "./dnd";
import {
    commit,
    currentArtifactId,
    editing,
    editor,
    editSeq,
    leftOpen,
    redo,
    setCanvasEl,
    setEditor,
    setHover,
    setRegions,
    setSelection,
    startEditing,
    undo,
} from "./editor";
import { DropIndicator } from "./DropIndicator";
import { measureText } from "./measure";
import { Overlay } from "./Overlay";
import { SECTION_GAP, layoutSection } from "./render";
import { SectionActions } from "./SectionActions";
import { SectionToolbar } from "./SectionToolbar";
import { TextEditor } from "./TextEditor";

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

    const draw = (): void => {
        if (!paintHost) return;
        // The panels float over the canvas; reserve their gutters so centered content clears them.
        const profile = resolveProfile(editor.artifact.format);
        const web = profile.id === "web";
        const gap = profile.kind === "continuous" ? 0 : SECTION_GAP; // doc/web merge seamlessly
        const padL = leftOpen() ? PANEL_L : RAIL_GAP;
        const fullW = Math.max(360, (scrollEl.clientWidth || 800) - padL - RAIL_R);
        // Format-as-view: deck = wide cards, doc = narrow reading column, web = full-bleed bands.
        const contentW = Math.min(fullW - 64, profile.maxContentWidth ?? 1080);
        paintHost.replaceChildren();

        // suppress the painted text of the element being edited — only the live overlay shows it
        const editAddr = editing();
        const editId = editAddr ? elementRegionId(editAddr) : null;
        const theme = resolveTheme(editor.artifact.theme).tokens;

        let y = 0;
        const tops: number[] = [];
        const all: Region[] = [];
        for (const section of editor.artifact.sections) {
            const bleed = (section.bleed ?? false) || web;
            const layoutW = bleed ? fullW : contentW;
            const x = bleed ? 0 : Math.round((fullW - contentW) / 2);
            const { commands, regions, height } = layoutSection(
                section,
                layoutW,
                measureText,
                theme,
                profile,
            );
            const visible = editId
                ? commands.filter((c) => !(c.kind === "text" && c.id === editId))
                : commands;
            const layer = document.createElement("div");
            layer.style.cssText = `left:${x}px;top:${y}px;width:${layoutW}px;height:${height}px`;
            paint(visible, layer);
            layer.style.position = "absolute"; // paint() forces relative; keep layers out of flow
            paintHost.appendChild(layer);
            for (const r of regions)
                all.push({
                    id: r.id,
                    box: { x: r.box.x + x, y: r.box.y + y, w: r.box.w, h: r.box.h },
                });
            tops.push(y);
            y += height + gap;
        }
        stageEl.style.height = `${y}px`;
        setEditor("sectionTops", tops);
        liveRegions = all;
        setRegions(all);
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
        if (drag() || editing()) return;
        pending = { target: hitTest(...point(e)), x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent): void => {
        if (drag() || editing()) return; // active drag is driven by the window listeners below
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
        if (drag() || editing() || !pending) return;
        const t = pending.target;
        const caret = { x: pending.x, y: pending.y };
        pending = null;
        setSelection(t);
        // A clean click on text drops straight into editing, caret at the click point (drag = move).
        if (t?.kind === "element" && getElementAt(editor.artifact, t.address)?.type === "text") {
            startEditing(t.address, caret);
        }
    };

    onMount(() => {
        setCanvasEl(scrollEl);
        const ro = new ResizeObserver(() => draw());
        ro.observe(scrollEl);
        // Web fonts arrive after first paint — re-measure once they (or a theme's font) finish loading.
        const onFonts = (): void => draw();
        void document.fonts.ready.then(onFonts);
        document.fonts.addEventListener("loadingdone", onFonts);
        const onKey = (e: KeyboardEvent): void => {
            if (editing()) return; // the inline editor owns the keyboard while active
            if (e.key === "Escape") setSelection((cur) => (cur ? parentTarget(cur) : null));
            else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            }
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => {
            ro.disconnect();
            document.fonts.removeEventListener("loadingdone", onFonts);
            window.removeEventListener("keydown", onKey);
        });
    });

    // editSeq() bumps on every edit; currentArtifactId() changes on load — either forces a redraw.
    createEffect(() => {
        editSeq();
        currentArtifactId();
        draw();
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
            if (d?.target) {
                commit(applyDrop(editor.artifact, d.target, d.payload));
                setSelection({ kind: "cell", section: d.target.section, cell: d.target.cell });
                setHover(null);
            }
            setDrag(null);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        onCleanup(() => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        });
    });

    const pageStyle = createMemo(() => {
        const tk = resolveTheme(editor.artifact.theme).tokens;
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
            onPointerLeave={() => !drag() && setHover(null)}
        >
            <div ref={stageEl} class="relative w-full">
                <div ref={paintHost} class="absolute inset-0" />
                <Overlay />
                <DropIndicator />
                <SectionActions />
                <SectionToolbar />
                <TextEditor />
            </div>
        </main>
    );
};
