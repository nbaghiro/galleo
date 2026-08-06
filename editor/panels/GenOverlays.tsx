import type { Component } from "solid-js";
import { createEffect, createMemo, Show } from "solid-js";
import type { Rect } from "@engine/node";
import { elementRegionId, sectionRegionId } from "@model/artifact";
import { profileFor } from "@engine/profile";
import { paint } from "@canvas/render/backends";
import { measureText, layoutSectionSkeleton } from "@canvas/render/commands";
import { placeholderSection } from "@canvas/elements/blueprint";
import { Eyebrow, Spinner } from "@ui/button";
import { FloatingBar } from "@ui/overlay";
import { GenOverlay } from "@ui/gen-overlay";
import { Icon } from "@ui/icons";
import { editor, editorAccent, editorTokens, regions } from "../core/store";
import { elementGen } from "../core/ai";
import { PLACEHOLDER_SECTION_ID, sectionGen } from "../core/ai";

export const ElementGenStage: Component = () => {
    const region = createMemo(() => {
        const a = elementGen.addr;
        if (!a || !elementGen.status) return null;
        return regions().find((r) => r.id === elementRegionId(a)) ?? null;
    });
    const box = createMemo<Rect | null>(() => region()?.box ?? null);

    return (
        <Show when={box()}>
            {(b) => (
                <GenOverlay
                    box={b()}
                    radius={region()?.radius ?? 8}
                    accent={editorAccent()}
                    state={elementGen.status === "error" ? "error" : "busy"}
                    z={30}
                    speed={1.9}
                    sweepHeight="55%"
                    accentMix={22}
                    ringWidth="1.5px"
                    wash
                />
            )}
        </Show>
    );
};

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
            layout: beat.layout,
            blocks: beat.blocks,
            image: beat.image,
        });
        const { commands } = layoutSectionSkeleton(
            sec,
            props.width,
            measureText,
            editorTokens(),
            profileFor(editor.artifact),
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
                            {/* opaque cover hides the placeholder's stand-in content */}
                            <div
                                class="absolute inset-0"
                                style={{ background: editorTokens().bg }}
                            />
                            <SkeletonBase width={b().w} />
                        </>
                    }
                >
                    <FloatingBar tone="panel" anchor="center" pad="lg" rounded="2xl" shadow="2xl">
                        <Show when={done()} fallback={<Spinner size={16} tone="accent" />}>
                            <span
                                class="flex h-4 w-4 flex-none items-center justify-center rounded-full text-onaccent"
                                style={{ background: editorAccent() }}
                            >
                                <Icon name="sparkle" size={11} />
                            </span>
                        </Show>
                        <Eyebrow tone="soft" weight="normal" size={12} class="max-w-70 truncate">
                            {done() ? "Section added" : (sectionGen.caption || "Generating") + "…"}
                        </Eyebrow>
                    </FloatingBar>
                </GenOverlay>
            )}
        </Show>
    );
};
