import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import type { Rect } from "@engine/node";
import { elementRegionId, sectionRegionId } from "@model/artifact";
import { drag, dragSlots, sameTarget, type DropSlot } from "@editor/core/dnd";
import { editorAccent, editorTokens, regions } from "@editor/core/store";

// Overlay-only drop feedback: the canvas never repaints during a drag, so every mark here is an
// absolutely positioned div over slot geometry. Section-gap markers show from drag start; a
// section's own element and column slots fade in once one of them holds the active claim.

const boxStyle = (b: Rect): Record<string, string> => ({
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.w}px`,
    height: `${b.h}px`,
});

// a line indicator thickened to w px, centred on its geometric position
const lineStyle = (s: DropSlot, w: number): Record<string, string> => {
    const ind = s.indicator;
    if (ind.kind !== "line") return {};
    return ind.axis === "v"
        ? boxStyle({ x: ind.x - w / 2, y: ind.y, w, h: ind.length })
        : boxStyle({ x: ind.x, y: ind.y - w / 2, w: ind.length, h: w });
};

export const DropIndicators: Component = () => {
    const active = createMemo((): DropSlot | null => {
        const t = drag()?.target;
        return t ? (dragSlots().find((s) => sameTarget(s.target, t)) ?? null) : null;
    });
    const candidates = createMemo((): DropSlot[] => {
        if (!drag()) return [];
        const a = active();
        const sid = a?.target.section || null;
        return dragSlots().filter(
            (s) =>
                !(a && sameTarget(s.target, a.target)) &&
                (s.target.op === "newSection" || (sid !== null && s.target.section === sid)),
        );
    });
    const activeLine = createMemo(() => {
        const a = active();
        return a?.indicator.kind === "line" ? a : null;
    });
    const activeRegion = createMemo(() => {
        const a = active();
        return a?.indicator.kind === "region" ? a : null;
    });
    const cap = (style: Record<string, string>) => (
        <div class="absolute rounded-full" style={{ ...style, background: "inherit" }} />
    );
    return (
        <Show when={drag()}>
            <For each={candidates()}>
                {(s) => (
                    <Show
                        when={s.indicator.kind === "line"}
                        fallback={
                            <div
                                class="pointer-events-none absolute rounded-lg border-[1.5px] border-dashed opacity-40"
                                style={{
                                    ...boxStyle((s.indicator as { box: Rect }).box),
                                    "border-color": editorTokens().line,
                                }}
                            />
                        }
                    >
                        <div
                            class="pointer-events-none absolute rounded-full opacity-40"
                            style={{ ...lineStyle(s, 1.5), background: editorTokens().line }}
                        />
                    </Show>
                )}
            </For>
            {/* one persistent div, so moving between slots slides instead of blinking */}
            <Show when={activeLine()}>
                {(s) => (
                    <div
                        class="pointer-events-none absolute z-raised rounded-full transition-all duration-100 motion-reduce:transition-none"
                        style={{ ...lineStyle(s(), 3), background: editorAccent() }}
                    >
                        <Show
                            when={(s().indicator as { axis: "v" | "h" }).axis === "v"}
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
                        class="pointer-events-none absolute z-raised rounded-lg border-2 transition-all duration-100 motion-reduce:transition-none"
                        style={{
                            ...boxStyle((s().indicator as { box: Rect }).box),
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
    const src = createMemo(() => {
        const p = drag()?.payload;
        if (!p || p.kind === "new") return null;
        const id = p.kind === "move" ? elementRegionId(p.from) : sectionRegionId(p.id);
        return regions().find((r) => r.id === id) ?? null;
    });
    return (
        <Show when={src()}>
            {(r) => (
                <div
                    class="pointer-events-none absolute opacity-65"
                    style={{
                        ...boxStyle(r().box),
                        "border-radius": `${r().radius ?? 0}px`,
                        background: editorTokens().surface,
                    }}
                />
            )}
        </Show>
    );
};
