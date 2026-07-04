import type { ArtifactContent } from "@model/artifact";
import type { Component } from "solid-js";
import { createEffect } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes/library";
import { backdropCss } from "@studio/canvas/backdrop";
import { SECTION_GAP } from "@studio/canvas/render";
import { paintSectionStack } from "@studio/canvas/stage";

// Read-only render of an artifact in a chosen format — the SAME continuous canvas the studio editor
// uses (deck = wide cards with gaps, doc = reading column, web = full-bleed bands), at each section's
// natural height. (Present's 16:9 slide framing is intentionally NOT used, so backgrounds show fully.)
const PAD = 28;

export const PreviewCanvas: Component<{ content: ArtifactContent; format: () => string }> = (
    props,
) => {
    let host!: HTMLDivElement;

    const render = (): void => {
        if (!host) return;
        const tk = resolveTheme(props.content.theme).tokens;
        const profile = resolveProfile(props.format());
        const gap = profile.kind === "continuous" ? 0 : SECTION_GAP;
        const fullW = host.clientWidth || 1100;
        host.style.background = backdropCss(props.content.background, tk);
        const stage = document.createElement("div");
        stage.style.cssText = `position:relative;width:${fullW}px`;
        const { height } = paintSectionStack(stage, props.content.sections, profile, tk, {
            fullW,
            startY: PAD,
        });
        stage.style.height = `${height - gap + PAD}px`;
        host.replaceChildren(stage);
    };

    createEffect(() => {
        props.format();
        render();
    });

    return <div ref={host} class="h-full w-full overflow-y-auto" />;
};
