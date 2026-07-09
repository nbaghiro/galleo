import type { Component } from "solid-js";
import { createEffect, createMemo, Show } from "solid-js";
import type { Rect } from "@engine/node";
import { sectionRegionId } from "@model/target";
import { resolveProfile } from "@engine/profile";
import { paint } from "@canvas/render/backends";
import { measureText, layoutSectionSkeleton } from "@canvas/render/commands";
import { placeholderSection } from "@canvas/elements/blueprint";
import { Eyebrow, Spinner } from "@ui/button";
import { FloatingBar } from "@ui/overlay";
import { GenOverlay } from "@ui/gen-overlay";
import { editor, editorAccent, editorTokens, regions } from "../editor";
import { Icon } from "@ui/icons";
import { PLACEHOLDER_SECTION_ID, sectionGen } from "./section-gen";

// The in-canvas build animation for a single inserted section — the "Skeleton Cascade" language, adapted to
// one section forming in place. It paints the section's own skeleton (the exact grid the writer fills) and
// runs a soft accent light down through it, with the frame glowing, while a caption tracks the run. Calm and
// consistent with the generate modal's loader — no drifting tiles. Everything paints via @canvas.

// The structural ghost of the planned section — the exact grid the writer fills, painted over the box so the
// "generating" frame reads as a clean skeleton (not the placeholder's stand-in content).
const SkeletonBase: Component<{ width: number }> = (props) => {
    let host!: HTMLDivElement;
    createEffect(() => {
        const beat = sectionGen.beat;
        if (!beat) {
            host.replaceChildren();
            return;
        }
        const sec = placeholderSection({
            id: PLACEHOLDER_SECTION_ID,
            grid: beat.grid,
            blocks: beat.blocks,
            image: beat.image,
        });
        const { commands } = layoutSectionSkeleton(
            sec,
            props.width,
            measureText,
            editorTokens(),
            resolveProfile(editor.artifact.format),
        );
        paint(commands, host);
    });
    return <div ref={host} class="absolute inset-0" />;
};

export const SectionGenStage: Component = () => {
    const showing = createMemo(() => {
        const s = sectionGen.stage;
        return s === "planning" || s === "writing" || s === "done";
    });
    const region = createMemo(() =>
        showing()
            ? (regions().find((r) => r.id === sectionRegionId(PLACEHOLDER_SECTION_ID)) ?? null)
            : null,
    );
    const box = createMemo<Rect | null>(() => region()?.box ?? null);
    const done = (): boolean => sectionGen.stage === "done";

    return (
        <Show when={box()}>
            {(b) => (
                <GenOverlay
                    box={b()}
                    radius={region()?.radius ?? 0}
                    accent={editorAccent()}
                    state={done() ? "done" : "busy"}
                    speed={2.6}
                    sweepHeight="48%"
                    accentMix={20}
                    ringWidth="2px"
                    blockPointer
                    base={
                        <>
                            {/* opaque cover hides the placeholder's stand-in content, then the skeleton */}
                            <div
                                class="absolute inset-0"
                                style={{ background: editorTokens().bg }}
                            />
                            <SkeletonBase width={b().w} />
                        </>
                    }
                >
                    {/* centre status chip */}
                    <FloatingBar tone="panel" anchor="center" pad="lg" rounded="2xl" shadow="2xl">
                        <Show when={done()} fallback={<Spinner size={16} tone="accent" />}>
                            <span
                                class="flex h-4 w-4 flex-none items-center justify-center rounded-full text-onaccent"
                                style={{ background: editorAccent() }}
                            >
                                <Icon name="sparkle" size={11} />
                            </span>
                        </Show>
                        <Eyebrow
                            tone="soft"
                            weight="normal"
                            size={12}
                            class="max-w-[280px] truncate"
                        >
                            {done() ? "Section added" : (sectionGen.caption || "Generating") + "…"}
                        </Eyebrow>
                    </FloatingBar>
                </GenOverlay>
            )}
        </Show>
    );
};
