import type { Tokens } from "@themes/theme";
import type { Component } from "solid-js";
import { createEffect } from "solid-js";
import { resolveProfile } from "@engine/profile";
import { paint } from "@studio/canvas/backends";
import { measureText, layoutSlide } from "@studio/canvas/render";
import { THEME_SAMPLE } from "../theme/theme-sample";

// Live, engine-rendered theme preview — the real layout/paint pipeline (same as SectionThumb), but
// reactive: it re-lays-out whenever the passed token set changes, so the builder reflects edits as
// they happen. Renders the shared sample section into a scaled 16:9 frame.
const LW = 1280; // layout width, scaled down to the card
const SH = 720; // 16:9 slide frame

export const ThemePreview: Component<{ tokens: Tokens; width?: number }> = (props) => {
    let inner!: HTMLDivElement;
    const w = (): number => props.width ?? 320;
    const h = (): number => Math.round((w() * 9) / 16);

    createEffect(() => {
        // read props.tokens fields (via layoutSlide) + width so the effect re-runs on any change
        const tokens = props.tokens;
        const width = w();
        if (!inner) return;
        const format = resolveProfile("deck");
        const { commands, height } = layoutSlide(THEME_SAMPLE, LW, SH, measureText, tokens, format);
        inner.style.cssText = `width:${LW}px;height:${height}px;transform:scale(${width / LW});transform-origin:top left`;
        paint(commands, inner);
    });

    return (
        <div
            class="overflow-hidden rounded-xl border border-line"
            style={{ width: `${w()}px`, height: `${h()}px` }}
        >
            <div ref={inner} />
        </div>
    );
};
