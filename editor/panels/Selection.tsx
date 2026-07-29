import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { Rect, Region } from "@engine/node";
import type { ElementAddress, Target } from "@model/target";
import { elementRegionId, regionId, sectionRegionId } from "@model/target";
import type { ElementLayout } from "@model/geometry";
import type { ArtifactContent } from "@model/artifact";
import { getElementAt, setElementLayout, updateDataAt, setSectionBackground } from "@elements/ops";
import { getElement } from "@elements/spec";
import { resolveProfile } from "@engine/profile";
import {
    commit,
    editor,
    editorAccent,
    hover,
    moveSectionTo,
    regions,
    selection,
    setSelection,
    stageEl,
    addSectionAfter,
    duplicateSectionAt,
    moveSectionBy,
    removeSectionAt,
} from "../core/store";
import { startDrag, drag } from "../core/dnd";
import { openSectionPrompt } from "../core/ai";
import { pickMedia } from "../core/media";
import { SectionLayoutPopup } from "./SectionLayoutPopup";
import { Icon } from "@ui/icons";
import { IconButton } from "@ui/button";
import { FloatingBar, Popover } from "@ui/overlay";
import { Separator } from "@ui/inputs";

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const EDGE = 8; // draggable border thickness
const DRAG_THRESHOLD = 5; // px of pointer travel before a grip press becomes an actual drag (vs. a click)

export const [sectionDrop, setSectionDrop] = createSignal<number | null>(null);
export const [sectionDragId, setSectionDragId] = createSignal<string | null>(null);

// Which section gap the cursor sits in, vs. the pre-drag tops.
function sectionTargetAt(clientY: number, tops: number[]): number {
    const stage = stageEl();
    if (!stage || !tops.length) return 0;
    const y = clientY - stage.getBoundingClientRect().top;
    for (let i = 0; i < tops.length; i++) {
        const next = tops[i + 1] ?? tops[i]! + 600;
        if (y < (tops[i]! + next) / 2) return i;
    }
    return tops.length;
}

// Target detection runs against a snapshot of the pre-drag tops, so it stays stable while the stack reorders under the cursor.
export function startSectionDrag(id: string): void {
    const tops = [...editor.sectionTops];
    const start = editor.artifact.sections.findIndex((s) => s.id === id);
    setSectionDragId(id);
    setSectionDrop(Math.max(0, start)); // dim in place immediately (a no-op reorder) until the first move
    const move = (e: PointerEvent): void => {
        setSectionDrop(sectionTargetAt(e.clientY, tops));
    };
    const up = (): void => {
        const target = sectionDrop();
        setSectionDragId(null);
        setSectionDrop(null);
        if (target !== null) moveSectionTo(id, target);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
}

export const DragHandle: Component = () => {
    const ctx = createMemo(() => {
        if (drag() || sectionDragId()) return null;
        const t = hover() ?? selection();
        if (t?.kind === "element") {
            const box = regions().find((r) => r.id === elementRegionId(t.address))?.box;
            return box ? { kind: "element" as const, box, address: t.address } : null;
        }
        if (t?.kind === "section") {
            const box = regions().find((r) => r.id === sectionRegionId(t.section))?.box;
            return box ? { kind: "section" as const, box, section: t.section } : null;
        }
        return null;
    });
    const onDown = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        const c = ctx();
        if (!c) return;
        // Don't start until the pointer passes a threshold: a plain click on the grip must only select, not lift.
        // Capture-phase move listener so it fires even over the grip (whose own onPointerMove stops bubbling).
        const sx = e.clientX;
        const sy = e.clientY;
        const begin = (): void => {
            if (c.kind === "element") {
                const inst = getElementAt(editor.artifact, c.address);
                const label = (inst && getElement(inst.type)?.label) || "Element";
                startDrag({ kind: "move", from: c.address }, sx, sy, label);
            } else {
                startSectionDrag(c.section);
            }
        };
        const done = (): void => {
            window.removeEventListener("pointermove", onMove, true);
            window.removeEventListener("pointerup", onUp, true);
        };
        const onMove = (ev: PointerEvent): void => {
            if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < DRAG_THRESHOLD) return;
            done();
            begin();
        };
        const onUp = (): void => {
            done();
            setSelection(
                c.kind === "element"
                    ? { kind: "element", address: c.address }
                    : { kind: "section", section: c.section },
            );
        };
        window.addEventListener("pointermove", onMove, true);
        window.addEventListener("pointerup", onUp, true);
    };
    return (
        <Show when={ctx()}>
            {(c) => (
                // Hit-zone runs flush to the element's left edge so crossing onto it keeps the region hovered;
                // onPointerMove stops the canvas recomputing hover while you're over it.
                <div
                    class="absolute z-menu flex cursor-grab items-center active:cursor-grabbing"
                    style={{
                        left: `${c().box.x - 26}px`,
                        top: `${c().box.y}px`,
                        width: "26px",
                        height: "26px",
                        "touch-action": "none",
                    }}
                    title="Drag to move"
                    onPointerDown={onDown}
                    onPointerMove={(e) => e.stopPropagation()}
                >
                    <div class="pointer-events-none flex h-5 w-4 items-center justify-center rounded-md border border-line bg-panel/90 text-muted shadow-sm backdrop-blur-md">
                        <Icon name="grip" size={12} />
                    </div>
                </div>
            )}
        </Show>
    );
};

export const ResizeHandles: Component = () => {
    const ctx = createMemo(() => {
        const sel = selection();
        if (sel?.kind !== "element") return null;
        const inst = getElementAt(editor.artifact, sel.address);
        const spec = inst ? getElement(inst.type) : undefined;
        if (!inst || !spec) return null;
        const hCfg = spec.resize?.height;
        const aCfg = spec.resize?.aspect;
        if (!hCfg && !aCfg) return null;
        const box = regions().find((r) => r.id === elementRegionId(sel.address))?.box;
        if (!box) return null;
        return { address: sel.address, box, hCfg, aCfg };
    });

    const onDown = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        const c = ctx();
        const stage = stageEl();
        if (!c || !stage) return;
        const rect = stage.getBoundingClientRect();
        const start = c.box;
        const move = (ev: PointerEvent): void => {
            const h = Math.max(8, ev.clientY - rect.top - start.y);
            const dataPatch: Record<string, unknown> = {};
            if (c.hCfg) {
                const step = c.hCfg.step ?? 1;
                dataPatch[c.hCfg.key] = Math.round(clamp(h, c.hCfg.min, c.hCfg.max) / step) * step;
            } else if (c.aCfg) {
                dataPatch.aspect =
                    Math.round(clamp(start.w / h, c.aCfg.min, c.aCfg.max) * 100) / 100;
            }
            setLiveEdit({ kind: "element", address: c.address, dataPatch });
        };
        const up = (): void => {
            const edit = liveEdit();
            setLiveEdit(null);
            if (edit) commit(applyLiveEdit(editor.artifact, edit));
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    return (
        <Show when={ctx()}>
            {(c) => (
                <div
                    class="group absolute z-panel"
                    style={{
                        left: `${c().box.x}px`,
                        top: `${c().box.y + c().box.h - EDGE / 2}px`,
                        width: `${c().box.w}px`,
                        height: `${EDGE}px`,
                        cursor: "ns-resize",
                        "touch-action": "none",
                    }}
                    onPointerDown={onDown}
                >
                    <div
                        class="absolute bottom-0 left-0 h-0.75 w-full rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ background: editorAccent() }}
                    />
                </div>
            )}
        </Show>
    );
};

interface Divider {
    key: string;
    x: number; // centre, canvas coords
    top: number;
    h: number;
    apply: (stageX: number) => LiveEdit; // stageX = clientX − stage.left
}

function siblingDividers(sid: string, regs: Region[]): Divider[] {
    // Group regions by parent path → sibling set: root's children (path []) are section columns, deeper groups are nested rows.
    const groups = new Map<
        string,
        { parentPath: number[]; members: { index: number; box: Rect }[] }
    >();
    for (const r of regs) {
        const parts = r.id.split(":");
        if (parts[0] !== "el" || parts[1] !== sid) continue;
        const pathStr = parts[2] ?? "";
        if (pathStr === "") continue; // the root has no sibling boundary
        const path = pathStr.split(".").map(Number);
        const key = path.slice(0, -1).join(".");
        let g = groups.get(key);
        if (!g) {
            g = { parentPath: path.slice(0, -1), members: [] };
            groups.set(key, g);
        }
        g.members.push({ index: path[path.length - 1]!, box: r.box });
    }
    const out: Divider[] = [];
    for (const g of groups.values()) {
        if (g.members.length < 2) continue;
        // Only reallocate between siblings sharing a horizontal band; skip column-stacked sets and grids (rows fully below one another).
        const tops = g.members.map((m) => m.box.y);
        const bottoms = g.members.map((m) => m.box.y + m.box.h);
        if (Math.max(...tops) >= Math.min(...bottoms)) continue;
        const sorted = [...g.members].sort((a, b) => a.box.x - b.box.x);
        const rowLeft = sorted[0]!.box.x;
        const last = sorted[sorted.length - 1]!.box;
        const rowWidth = last.x + last.w - rowLeft;
        if (rowWidth <= 0) continue;
        const fractions = sorted.map((m) => m.box.w / rowWidth);
        const top = Math.min(...tops);
        const h = Math.max(...bottoms) - top;
        for (let i = 0; i < sorted.length - 1; i++) {
            const before = fractions.slice(0, i).reduce((a, x) => a + x, 0);
            const combined = fractions[i]! + fractions[i + 1]!;
            const idxL = sorted[i]!.index;
            const idxR = sorted[i + 1]!.index;
            const parent: ElementAddress = { section: sid, path: g.parentPath };
            out.push({
                key: `el:${sid}:${g.parentPath.join(".")}:${i}`,
                x: (sorted[i]!.box.x + sorted[i]!.box.w + sorted[i + 1]!.box.x) / 2,
                top,
                h,
                apply: (stageX) => {
                    const fi = clamp((stageX - rowLeft) / rowWidth - before, 0.1, combined - 0.1);
                    return {
                        kind: "siblings",
                        parent,
                        entries: [
                            { index: idxL, pct: Math.round(fi * 100) },
                            { index: idxR, pct: Math.round((combined - fi) * 100) },
                        ],
                    };
                },
            });
        }
    }
    return out;
}

export const RegionDividers: Component = () => {
    // Hovered section's dividers, else the selected one. Hidden mid-drag — the dragged region is stale.
    const sid = createMemo<string | null>(() => {
        if (drag() || sectionDragId()) return null;
        const t = hover() ?? selection();
        if (!t) return null;
        return t.kind === "element" ? t.address.section : t.section;
    });

    const dividers = createMemo((): Divider[] => {
        const id = sid();
        return id ? siblingDividers(id, regions()) : [];
    });

    const onDown = (e: PointerEvent, d: Divider): void => {
        e.preventDefault();
        e.stopPropagation();
        const stage = stageEl();
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const move = (ev: PointerEvent): void => {
            setLiveEdit(d.apply(ev.clientX - rect.left));
        };
        const up = (): void => {
            const edit = liveEdit();
            setLiveEdit(null);
            if (edit) commit(applyLiveEdit(editor.artifact, edit));
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    return (
        <For each={dividers()}>
            {(d) => (
                <div
                    class="group absolute z-raised flex justify-center"
                    style={{
                        left: `${d.x - 6}px`,
                        top: `${d.top}px`,
                        width: "12px",
                        height: `${d.h}px`,
                        cursor: "col-resize",
                        "touch-action": "none",
                    }}
                    onPointerDown={(e) => onDown(e, d)}
                >
                    <div
                        class="h-full w-0.5 rounded-full opacity-25 transition-opacity duration-150 group-hover:opacity-100"
                        style={{ background: editorAccent() }}
                    />
                </div>
            )}
        </For>
    );
};

// Uncommitted handle edit: the canvas paints applyLiveEdit(...) live while dragging, then commits the same op on release.
export type LiveEdit =
    | {
          kind: "element";
          address: ElementAddress;
          layoutPatch?: Partial<ElementLayout>;
          dataPatch?: Record<string, unknown>; // height / aspect / gap / padding (element data)
      }
    | { kind: "siblings"; parent: ElementAddress; entries: { index: number; pct: number }[] };

export const [liveEdit, setLiveEdit] = createSignal<LiveEdit | null>(null);

export function applyLiveEdit(art: ArtifactContent, edit: LiveEdit): ArtifactContent {
    if (edit.kind === "siblings") {
        let out = art;
        for (const e of edit.entries) {
            const addr: ElementAddress = {
                section: edit.parent.section,
                path: [...edit.parent.path, e.index],
            };
            const inst = getElementAt(out, addr);
            if (inst)
                out = setElementLayout(out, addr, {
                    ...(inst.layout ?? {}),
                    width: { pct: e.pct },
                });
        }
        return out;
    }
    const inst = getElementAt(art, edit.address);
    if (!inst) return art;
    let out = art;
    if (edit.layoutPatch)
        out = setElementLayout(out, edit.address, { ...(inst.layout ?? {}), ...edit.layoutPatch });
    if (edit.dataPatch)
        out = updateDataAt(out, edit.address, {
            ...(inst.data as Record<string, unknown>),
            ...edit.dataPatch,
        });
    return out;
}

// Fallback radius for nodes that paint no corner (text, groups): square in doc/web, small round on decks.
const fallbackRadius = (): number =>
    resolveProfile(editor.artifact.format).kind === "continuous" ? 0 : 7;

// Highlights are box-shadow rings (no layout impact); each region carries its painted radius so the outline hugs with no gap.

function regionFor(t: Target | null): Region | null {
    if (!t) return null;
    const id = regionId(t);
    return regions().find((r) => r.id === id) ?? null;
}

const ring = (r: Region, shadow: string) => ({
    left: `${r.box.x}px`,
    top: `${r.box.y}px`,
    width: `${r.box.w}px`,
    height: `${r.box.h}px`,
    "border-radius": `${r.radius ?? fallbackRadius()}px`,
    "box-shadow": shadow,
});

export const Overlay: Component = () => {
    // Suppressed mid-drag: the painted layout has shifted, so a ring would strand over a stale spot.
    const sel = createMemo(() => (drag() || sectionDragId() ? null : regionFor(selection())));
    const hov = createMemo(() => {
        if (drag() || sectionDragId()) return null;
        const h = hover();
        if (!h) return null;
        const s = selection();
        if (s && regionId(s) === regionId(h)) return null;
        return regionFor(h);
    });
    return (
        <>
            <Show when={hov()}>
                {(r) => (
                    <div
                        class="pointer-events-none absolute opacity-50"
                        style={ring(r(), `0 0 0 1.5px ${editorAccent()}`)}
                    />
                )}
            </Show>
            <Show when={sel()}>
                {(r) => (
                    <div
                        class="pointer-events-none absolute"
                        style={ring(r(), `0 0 0 2px ${editorAccent()}`)}
                    />
                )}
            </Show>
        </>
    );
};

function sectionOf(t: Target | null): string | null {
    if (!t) return null;
    if (t.kind === "element") return t.address.section;
    return t.section;
}

const action =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-canvas";

// SectionActions pins its bar to the open-popup section so the anchor stays mounted if the cursor drifts away.
const [layoutOpen, setLayoutOpen] = createSignal<string | null>(null);

export const SectionActions: Component = () => {
    const sid = createMemo(() => layoutOpen() ?? sectionOf(hover()));
    const box = createMemo(() => {
        const id = sid();
        return id ? (regions().find((r) => r.id === sectionRegionId(id))?.box ?? null) : null;
    });
    const sectionBg = createMemo(() => {
        const id = sid();
        return id ? editor.artifact.sections.find((s) => s.id === id)?.background : undefined;
    });
    let pillRef: HTMLDivElement | undefined;

    return (
        <Show when={box()}>
            {(b) => (
                <>
                    <FloatingBar
                        ref={pillRef}
                        tone="panel"
                        rounded="full"
                        shadow="lg"
                        gap="0.5"
                        anchor="free"
                        class="absolute z-panel -translate-x-1/2"
                        style={{ left: `${b().x + b().w / 2}px`, top: `${b().y + b().h - 16}px` }}
                        onPointerMove={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <button
                            class={action}
                            title="Add a blank section below"
                            onClick={() => addSectionAfter(sid()!)}
                        >
                            <Icon name="plus" size={13} /> Section
                        </button>
                        <Separator vertical class="h-3.5" />
                        <button
                            class={action}
                            title="Generate a section here with AI"
                            onClick={() => openSectionPrompt(sid()!)}
                        >
                            <Icon name="sparkle" size={13} /> Generate
                        </button>
                        <Separator vertical class="h-3.5" />
                        <button
                            class={action}
                            title="Section layout & background"
                            onClick={() => setLayoutOpen(sid())}
                        >
                            <Icon name="layout" size={13} /> Layout
                        </button>
                        <Separator vertical class="h-3.5" />
                        <button
                            class={action}
                            title="Set a background image for this section"
                            onClick={() => {
                                const id = sid()!;
                                const bg = sectionBg();
                                pickMedia(
                                    (url) =>
                                        commit(
                                            setSectionBackground(editor.artifact, id, {
                                                ...bg,
                                                kind: "image",
                                                image: url,
                                            }),
                                        ),
                                    "photo",
                                );
                            }}
                        >
                            <Icon name="media" size={14} />
                        </button>
                    </FloatingBar>
                    <Popover
                        anchor={() => pillRef}
                        open={layoutOpen() !== null}
                        onClose={() => setLayoutOpen(null)}
                        fixedWidth={512}
                        estHeight={560}
                        align="center"
                        panelClass="p-3.5"
                    >
                        <SectionLayoutPopup section={sid()!} />
                    </Popover>
                </>
            )}
        </Show>
    );
};

export const SectionToolbar: Component = () => {
    const sid = createMemo(() => {
        const s = selection();
        return s?.kind === "section" ? s.section : null;
    });
    const box = createMemo(() => {
        const id = sid();
        return id ? (regions().find((r) => r.id === sectionRegionId(id))?.box ?? null) : null;
    });

    return (
        <Show when={box()}>
            {(b) => (
                <FloatingBar
                    tone="panel"
                    rounded="lg"
                    pad="sm"
                    shadow="lg"
                    anchor="free"
                    class="absolute z-panel"
                    style={{ left: `${b().x + 10}px`, top: `${b().y + 10}px` }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="ink"
                        title="Move up"
                        onClick={() => moveSectionBy(sid()!, -1)}
                    >
                        <Icon name="chevronUp" size={15} />
                    </IconButton>
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="ink"
                        title="Move down"
                        onClick={() => moveSectionBy(sid()!, 1)}
                    >
                        <Icon name="chevronDown" size={15} />
                    </IconButton>
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="ink"
                        title="Duplicate"
                        onClick={() => duplicateSectionAt(sid()!)}
                    >
                        <Icon name="duplicate" size={14} />
                    </IconButton>
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="ink"
                        title="Add section below"
                        onClick={() => addSectionAfter(sid()!)}
                    >
                        <Icon name="plus" size={15} />
                    </IconButton>
                    <IconButton
                        size="md"
                        rounded="md"
                        tone="accent"
                        title="Delete section"
                        onClick={() => removeSectionAt(sid()!)}
                    >
                        <Icon name="close" size={14} />
                    </IconButton>
                </FloatingBar>
            )}
        </Show>
    );
};
