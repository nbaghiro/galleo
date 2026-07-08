import type { Component } from "solid-js";
import { createEffect, createMemo, Show } from "solid-js";
import type { Rect } from "@engine/node";
import { sectionRegionId } from "@model/target";
import { resolveProfile } from "@engine/profile";
import { paint } from "@canvas/render/backends";
import { measureText, layoutSectionSkeleton } from "@canvas/render/commands";
import { placeholderSection } from "@canvas/elements/blueprint";
import { editor, editorAccent, editorTokens, regions } from "../editor";
import { Icon } from "../icons";
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
                <div
                    class="absolute z-20 overflow-hidden"
                    style={{
                        left: `${b().x}px`,
                        top: `${b().y}px`,
                        width: `${b().w}px`,
                        height: `${b().h}px`,
                        "border-radius": `${region()?.radius ?? 0}px`,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => e.stopPropagation()}
                >
                    <style>{`
                      @keyframes gc-sweep { 0% { transform: translateY(-120%); } 100% { transform: translateY(240%); } }
                      .gc-sweep { animation: gc-sweep 2.6s cubic-bezier(.4,0,.2,1) infinite; }
                      @keyframes gc-glow { 0%,100% { opacity: .35; } 50% { opacity: .85; } }
                      .gc-glow { animation: gc-glow 2.6s ease-in-out infinite; }
                      @media (prefers-reduced-motion: reduce) { .gc-sweep { animation: none; opacity: 0; } .gc-glow { animation: none; opacity: .5; } }
                    `}</style>

                    {/* opaque cover hides the placeholder's stand-in content, then the skeleton ghost */}
                    <div class="absolute inset-0" style={{ background: editorTokens().bg }} />
                    <SkeletonBase width={b().w} />

                    {/* a soft accent light building down through the skeleton (the cascade, one section) */}
                    <Show when={!done()}>
                        <div
                            class="gc-sweep pointer-events-none absolute inset-x-0 top-0"
                            style={{
                                height: "48%",
                                background: `linear-gradient(180deg, transparent, color-mix(in srgb, ${editorAccent()} 20%, transparent), transparent)`,
                            }}
                        />
                    </Show>

                    {/* the frame glowing as it forms */}
                    <div
                        class="gc-glow pointer-events-none absolute inset-0"
                        style={{
                            "border-radius": "inherit",
                            "box-shadow": `inset 0 0 0 2px ${editorAccent()}`,
                        }}
                    />

                    {/* centre status chip */}
                    <div class="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-2xl border border-line bg-panel/85 px-5 py-3 shadow-2xl backdrop-blur-md">
                        <Show
                            when={done()}
                            fallback={
                                <span
                                    class="h-4 w-4 flex-none animate-spin rounded-full border-2 border-line"
                                    style={{ "border-top-color": editorAccent() }}
                                />
                            }
                        >
                            <span
                                class="flex h-4 w-4 flex-none items-center justify-center rounded-full text-onaccent"
                                style={{ background: editorAccent() }}
                            >
                                <Icon name="sparkle" size={11} />
                            </span>
                        </Show>
                        <span class="max-w-[280px] truncate font-mono text-[12px] uppercase tracking-[0.12em] text-soft">
                            {done() ? "Section added" : (sectionGen.caption || "Generating") + "…"}
                        </span>
                    </div>
                </div>
            )}
        </Show>
    );
};
