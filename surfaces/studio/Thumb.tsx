import type { Section } from "@model/content";
import type { Component } from "solid-js";
import { createEffect } from "solid-js";
import { paint } from "./dom-backend";
import { jumpToSection } from "./editor";
import { measureText } from "./measure";
import { layoutSection } from "./render";

const THUMB_LAYOUT_WIDTH = 760; // lay out realistically, then scale to fit the rail

export const Thumb: Component<{ section: Section; index: number }> = (props) => {
    let wrap!: HTMLButtonElement;
    let inner!: HTMLDivElement;

    createEffect(() => {
        const w = wrap.clientWidth || 150;
        const scale = w / THUMB_LAYOUT_WIDTH;
        const { commands, height } = layoutSection(props.section, THUMB_LAYOUT_WIDTH, measureText);
        inner.style.cssText = `width:${THUMB_LAYOUT_WIDTH}px;height:${height}px;transform:scale(${scale});transform-origin:top left`;
        paint(commands, inner);
        wrap.style.height = `${Math.round(height * scale) + 2}px`;
    });

    return (
        <button
            ref={wrap}
            onClick={() => jumpToSection(props.index)}
            class="relative block w-full cursor-pointer overflow-hidden rounded-lg border border-line bg-[#fffdf8] p-0 hover:border-accent"
        >
            <span class="absolute left-1.5 top-1 z-10 font-mono text-[10px] font-semibold text-muted">
                {props.index + 1}
            </span>
            <div ref={inner} />
        </button>
    );
};
