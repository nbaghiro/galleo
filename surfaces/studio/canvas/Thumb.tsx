import type { Section } from "@model/artifact";
import type { Component } from "solid-js";
import { createEffect } from "solid-js";
import { paint } from "./backends";
import { editorTokens, jumpToSection } from "../editor";
import { measureText, layoutSection } from "./render";

const THUMB_LAYOUT_WIDTH = 760; // lay out realistically, then scale to fit the rail

export const Thumb: Component<{ section: Section; index: number }> = (props) => {
    let wrap!: HTMLButtonElement;
    let inner!: HTMLDivElement;

    createEffect(() => {
        const w = wrap.clientWidth || 150;
        const scale = w / THUMB_LAYOUT_WIDTH;
        const theme = editorTokens();
        const { commands, height } = layoutSection(
            props.section,
            THUMB_LAYOUT_WIDTH,
            measureText,
            theme,
        );
        inner.style.cssText = `width:${THUMB_LAYOUT_WIDTH}px;height:${height}px;transform:scale(${scale});transform-origin:top left`;
        paint(commands, inner);
        wrap.style.height = `${Math.round(height * scale) + 2}px`;
    });

    return (
        <div class="flex items-center gap-2">
            <span class="w-3.5 shrink-0 text-right font-mono text-[10px] font-semibold leading-none text-muted">
                {props.index + 1}
            </span>
            <button
                ref={wrap}
                onClick={() => jumpToSection(props.index)}
                class="relative block min-w-0 flex-1 cursor-pointer overflow-hidden rounded-lg border border-line bg-canvas p-0 hover:border-accent"
            >
                <div ref={inner} />
            </button>
        </div>
    );
};
