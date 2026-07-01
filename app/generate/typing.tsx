import type { Component } from "solid-js";
import { createEffect, createSignal, onCleanup } from "solid-js";

export const reduced = (): boolean =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// Types the active line on, char by char — shared by every generation direction's narration.
export const TypingLine: Component<{ text: string }> = (props) => {
    const [n, setN] = createSignal(0);
    let timer = 0;
    createEffect(() => {
        const text = props.text;
        setN(0);
        window.clearInterval(timer);
        if (reduced()) {
            setN(text.length);
            return;
        }
        timer = window.setInterval(() => {
            setN((v) => {
                if (v >= text.length) {
                    window.clearInterval(timer);
                    return v;
                }
                return v + 1;
            });
        }, 18);
    });
    onCleanup(() => window.clearInterval(timer));
    return (
        <>
            {props.text.slice(0, n())}
            <span class="ml-px animate-pulse text-accent">▋</span>
        </>
    );
};
