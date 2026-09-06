import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import type { Rect, Region } from "@engine/node";
import { elementRegionId, sectionRegionId } from "@model/artifact";
import { drag, part, type SlotIndicator } from "@editor/core/dnd";
import { editorAccent, editorTokens, regions } from "@editor/core/store";

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

export const DropIndicators: Component = () => {
    const activeLine = createMemo(() => {
        const ind = drag()?.indicator;
        return ind?.kind === "line" ? ind : null;
    });
    const activeRegion = createMemo(() => {
        const ind = drag()?.indicator;
        return ind?.kind === "region" ? ind : null;
    });
    const cap = (style: Record<string, string>) => (
        <div class="absolute rounded-full" style={{ ...style, background: "inherit" }} />
    );
    return (
        <Show when={drag()}>
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

// The parting preview paints the dropped content for real; this veil over it is what reads as
// "ghost": the true post-drop picture, dimmed until release makes it opaque.
export const GhostVeil: Component = () => (
    <Show when={part()?.ghost} keyed>
        {(r) => (
            <div
                data-testid="ghost-veil"
                class="pointer-events-none absolute opacity-45"
                style={{
                    ...boxStyle(r.box),
                    "border-radius": `${r.radius ?? 0}px`,
                    background: editorTokens().surface,
                }}
            />
        )}
    </Show>
);

// A move drag — element or section — leaves the source painted in place; this dims it until the
// drop relocates it.
export const LiftVeil: Component = () => {
    // a block drag lifts every member, so the veil is a list rather than one box
    const src = createMemo((): Region[] => {
        // while a parting preview shows, the source hole is already closed in the paint itself
        if (part()) return [];
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
