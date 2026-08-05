import type { Component, JSX } from "solid-js";
import { createEffect } from "solid-js";

export const Inline: Component<{
    value: string;
    placeholder?: string;
    class?: string;
    ariaLabel: string;
    onChange: (v: string) => void;
}> = (props) => {
    let el!: HTMLTextAreaElement;
    const fit = (): void => {
        el.style.height = "0px";
        el.style.height = `${el.scrollHeight}px`;
    };
    // re-fit whenever the value changes from outside (a chat proposal, a reroll), not just on input
    createEffect(() => {
        const next = props.value;
        if (el && el.value !== next) el.value = next;
        if (el) fit();
    });
    return (
        <textarea
            ref={el}
            rows={1}
            aria-label={props.ariaLabel}
            spellcheck={false}
            class={`w-full resize-none overflow-hidden rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1.5 py-0.5 -mx-1.5 text-ink outline-none transition-colors placeholder:text-muted hover:border-line focus:border-accent focus:bg-canvas/40 ${props.class ?? ""}`}
            placeholder={props.placeholder}
            value={props.value}
            onInput={(e) => {
                fit();
                props.onChange(e.currentTarget.value);
            }}
        />
    );
};

export const Field: Component<{ label: string; children: JSX.Element }> = (props) => (
    <div>
        <div class="mb-0.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted">
            {props.label}
        </div>
        {props.children}
    </div>
);

export const Tag: Component<{ children: JSX.Element; tone?: "accent" | "muted" }> = (props) => (
    <span
        class="rounded-[var(--radius-sm)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em]"
        classList={{
            "bg-accent/12 text-accent": props.tone === "accent",
            "bg-canvas text-muted": props.tone !== "accent",
        }}
    >
        {props.children}
    </span>
);
