import type { Component } from "solid-js";
import { createMemo, For, onMount, Show } from "solid-js";
import type { Rect, Region } from "@engine/node";
import type { ElementAddress } from "@model/artifact";
import { elementRegionId, sectionRegionId } from "@model/artifact";
import { layout } from "@engine/layout";
import { measureText } from "@canvas/render/commands";
import { paint } from "@canvas/render/backends";
import { paintedNodeFor } from "@editor/core/leaf";
import { drag, gutterPills, sectionCard, type SlotIndicator } from "@editor/core/dnd";
import { editor, editorAccent, editorTokens, regions } from "@editor/core/store";

// Overlay drop feedback: the single active claim's mark, classified with the target. The
// candidate lattice is gone on every path (decided 2026-09-06 with the classifier round: the
// active line tracks the pointer continuously, which is the aiming channel all paths share).

const boxStyle = (b: Rect): Record<string, string> => ({
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.w}px`,
    height: `${b.h}px`,
});

// a line indicator thickened to w px, centred on its geometric position
const lineStyle = (ind: SlotIndicator, w: number): Record<string, string> => {
    if (ind.kind !== "line") return {};
    return ind.axis === "v"
        ? boxStyle({ x: ind.x - w / 2, y: ind.y, w, h: ind.length })
        : boxStyle({ x: ind.x, y: ind.y - w / 2, w: ind.length, h: w });
};

// the lifted element itself, painted once and hopping between slot lines with a short glide
const CARD_MAX_H = 120;
const CARD_MAX_W = 360;

const LiftedPaint: Component<{ from: ElementAddress; w: number; h: number }> = (props) => {
    let host!: HTMLDivElement;
    onMount(() => {
        const node = paintedNodeFor(props.from);
        if (!node) return;
        const { commands } = layout(node, { x: 0, y: 0, w: props.w, h: props.h }, measureText);
        paint(commands, host);
    });
    return <div ref={host} class="relative h-full w-full" />;
};

// The slide's presence: the dragged element rides the active slot, not the pointer. A move
// paints the real element; a new element shows a slim accent card until the drop creates it.
export const SlotCard: Component = () => {
    const at = createMemo(() => {
        const d = drag();
        const ind = d?.indicator;
        if (!d || !ind || ind.kind !== "line") return null;
        if (d.payload.kind === "section") return null; // the band is the section's own mark
        return { d, ind };
    });
    const src = createMemo(() => {
        const a = at();
        if (!a || a.d.payload.kind !== "move") return null;
        const box = regions().find(
            (r) => r.id === elementRegionId((a.d.payload as { from: ElementAddress }).from),
        )?.box;
        return box ? { from: (a.d.payload as { from: ElementAddress }).from, box } : null;
    });
    const frame = createMemo(() => {
        const a = at();
        if (!a) return null;
        const box = src()?.box;
        // scale first, then size the card to the scaled content, so the mini card hugs the
        // element with no dead surface past its right edge
        const scale = box ? Math.min(1, CARD_MAX_W / box.w, CARD_MAX_H / box.h) : 1;
        const w = box ? box.w * scale : Math.min(220, Math.max(120, a.ind.length));
        const h = box ? box.h * scale : 28;
        const cx =
            a.ind.kind === "line" && a.ind.axis === "h" ? a.ind.x + a.ind.length / 2 : a.ind.x;
        const cy = a.ind.axis === "h" ? a.ind.y : a.ind.y + a.ind.length / 2;
        return { x: cx - w / 2, y: cy - h / 2, w, h, scale, box };
    });
    return (
        <Show when={frame()}>
            {(f) => (
                <div
                    data-testid="slot-card"
                    class="pointer-events-none absolute z-overlay overflow-hidden rounded-lg shadow-lg transition-all duration-100 motion-reduce:transition-none"
                    style={{
                        left: `${f().x}px`,
                        top: `${f().y}px`,
                        width: `${f().w}px`,
                        height: `${f().h}px`,
                        background: editorTokens().surface,
                        "box-shadow": `0 0 0 1.5px ${editorAccent()}, 0 8px 24px rgba(0,0,0,0.25)`,
                    }}
                >
                    <Show when={src()}>
                        {(m) => (
                            <div
                                class="origin-top-left"
                                style={{
                                    transform: `scale(${f().scale})`,
                                    width: `${m().box.w}px`,
                                    height: `${m().box.h}px`,
                                }}
                            >
                                <LiftedPaint from={m().from} w={m().box.w} h={m().box.h} />
                            </div>
                        )}
                    </Show>
                    <Show when={!src()}>
                        <div
                            class="h-full w-full"
                            style={{
                                background: `color-mix(in srgb, ${editorAccent()} 18%, transparent)`,
                            }}
                        />
                    </Show>
                </div>
            )}
        </Show>
    );
};

// the one structural affordance: slim pills at the hovered section's gutters split it into columns
export const GutterPills: Component = () => {
    const pills = createMemo(() => {
        const d = drag();
        if (!d || d.payload.kind === "section") return [];
        const sid = editor.artifact.sections.find((sec) => {
            const b = sectionCard(regions(), sec.id);
            return b && d.px >= b.x && d.px <= b.x + b.w && d.py >= b.y && d.py <= b.y + b.h;
        })?.id;
        return sid ? gutterPills(editor.artifact, regions(), sid, d.payload) : [];
    });
    const active = createMemo(() => {
        const d = drag();
        return d?.target?.op === "column" ? d.target.index : null;
    });
    return (
        <For each={pills()}>
            {(p) => (
                <div
                    data-testid="gutter-pill"
                    class="pointer-events-none absolute rounded-full transition-all duration-100 motion-reduce:transition-none"
                    style={{
                        left: `${p.line.kind === "line" ? p.line.x - (active() === p.target.index ? 3 : 2) : 0}px`,
                        top: `${p.box.y + 8}px`,
                        width: `${active() === p.target.index ? 6 : 4}px`,
                        height: `${p.box.h - 16}px`,
                        background:
                            active() === p.target.index
                                ? editorAccent()
                                : `color-mix(in srgb, ${editorAccent()} 45%, transparent)`,
                    }}
                />
            )}
        </For>
    );
};

export const DropIndicators: Component = () => {
    const newSection = createMemo(() => drag()?.target?.op === "newSection");
    const activeLine = createMemo(() => {
        const ind = drag()?.indicator;
        return ind?.kind === "line" && !newSection() ? ind : null;
    });
    const activeRegion = createMemo(() => {
        const ind = drag()?.indicator;
        return ind?.kind === "region" ? ind : null;
    });
    // the other half of the signal: the container the drop goes into, outlined the whole time a
    // target is active; dashed when the receiver does not exist yet (a wrap, a stack, a section)
    const receiver = createMemo(() => {
        const d = drag();
        if (!d?.receiver || d.indicator?.kind === "region") return null;
        return { box: d.receiver, implicit: d.implicit, band: newSection() };
    });
    const cap = (style: Record<string, string>) => (
        <div class="absolute rounded-full" style={{ ...style, background: "inherit" }} />
    );
    return (
        <Show when={drag()}>
            <Show when={receiver()}>
                {(r) => (
                    <div
                        data-testid="drop-receiver"
                        class="pointer-events-none absolute rounded-lg transition-all duration-100 motion-reduce:transition-none"
                        classList={{
                            "border-2": !r().band,
                            "border-dashed": r().implicit && !r().band,
                        }}
                        style={{
                            ...boxStyle(r().box),
                            "border-color": r().band ? "transparent" : editorAccent(),
                            background: `color-mix(in srgb, ${editorAccent()} ${r().band ? 10 : 4}%, transparent)`,
                        }}
                    />
                )}
            </Show>
            {/* one persistent div, so moving between slots slides instead of blinking */}
            <Show when={activeLine()}>
                {(s) => (
                    <div
                        data-testid="drop-active"
                        class="pointer-events-none absolute z-raised rounded-full transition-all duration-100 motion-reduce:transition-none"
                        style={{ ...lineStyle(s(), 3), background: editorAccent() }}
                    >
                        <Show
                            when={s().axis === "v"}
                            fallback={
                                <>
                                    {cap({
                                        width: "3px",
                                        height: "9px",
                                        top: "-3px",
                                        left: "-1px",
                                    })}
                                    {cap({
                                        width: "3px",
                                        height: "9px",
                                        top: "-3px",
                                        right: "-1px",
                                    })}
                                </>
                            }
                        >
                            {cap({ width: "9px", height: "3px", left: "-3px", top: "-1px" })}
                            {cap({ width: "9px", height: "3px", left: "-3px", bottom: "-1px" })}
                        </Show>
                    </div>
                )}
            </Show>
            <Show when={activeRegion()}>
                {(s) => (
                    <div
                        data-testid="drop-active-region"
                        class="pointer-events-none absolute z-raised rounded-lg border-2 transition-all duration-100 motion-reduce:transition-none"
                        style={{
                            ...boxStyle((s() as { box: Rect }).box),
                            "border-color": editorAccent(),
                            background: `color-mix(in srgb, ${editorAccent()} 8%, transparent)`,
                        }}
                    />
                )}
            </Show>
        </Show>
    );
};

// A move drag — element or section — leaves the source painted in place; this dims it until the
// drop relocates it.
export const LiftVeil: Component = () => {
    // a block drag lifts every member, so the veil is a list rather than one box
    const src = createMemo((): Region[] => {
        const p = drag()?.payload;
        if (!p || p.kind === "new") return [];
        const ids =
            p.kind === "move"
                ? [elementRegionId(p.from)]
                : p.kind === "section"
                  ? [sectionRegionId(p.id)]
                  : p.indices.map((i) =>
                        elementRegionId({ section: p.parent.section, path: [...p.parent.path, i] }),
                    );
        return ids
            .map((id) => regions().find((r) => r.id === id))
            .filter((r): r is Region => r !== undefined);
    });
    return (
        <For each={src()}>
            {(r) => (
                <div
                    data-testid="lift-veil"
                    class="pointer-events-none absolute opacity-65"
                    style={{
                        ...boxStyle(r.box),
                        "border-radius": `${r.radius ?? 0}px`,
                        background: editorTokens().surface,
                    }}
                />
            )}
        </For>
    );
};
