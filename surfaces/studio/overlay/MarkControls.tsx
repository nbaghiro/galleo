import type { Component, JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import type { MarkType } from "../../../kernel/text/model";
import { editorTokens } from "../editor";
import { ColorPicker, highlightSwatches, textColorSwatches } from "../controls/ColorPicker";
import {
    activeMarks,
    activeValues,
    clearTextMark,
    setTextMark,
    textSelection,
    toggleTextMark,
} from "../editing/text-format";
import { Icon } from "../icons";

// The inline-mark group of the text format bar: bold/italic/underline/strike + inline code, then text
// color, highlight, and link (each a small picker popover). Rendered inside the ContextBar (which
// carries `data-galleo-toolbar`, so interacting here doesn't end the edit). Buttons use onMouseDown
// preventDefault to keep the contenteditable focused + selected; only the link URL input takes focus,
// and it acts on a selection range captured before the input stole focus.

const BOOL: { type: MarkType; icon: string; title: string }[] = [
    { type: "b", icon: "bold", title: "Bold (⌘B)" },
    { type: "i", icon: "italic", title: "Italic (⌘I)" },
    { type: "u", icon: "underline", title: "Underline (⌘U)" },
    { type: "s", icon: "strike", title: "Strikethrough" },
];

const btn = (active: boolean): string =>
    `flex h-7 min-w-7 items-center justify-center rounded-md px-1 transition-colors ${
        active ? "bg-accent text-onaccent" : "text-ink hover:bg-canvas"
    }`;
const sep = (): JSX.Element => <span class="mx-0.5 h-5 w-px bg-line" />;
const noBlur = (e: MouseEvent): void => e.preventDefault();
const popCls =
    "absolute left-1/2 top-full z-50 mt-2 w-60 -translate-x-1/2 rounded-xl border border-line bg-panel/95 p-2.5 shadow-2xl backdrop-blur-md";

export const MarkControls: Component = () => {
    const [pop, setPop] = createSignal<null | "color" | "hl" | "link">(null);
    const [linkUrl, setLinkUrl] = createSignal("");
    let linkRange: { from: number; to: number } | null = null;
    // The selection captured when a color/highlight popover opens — reused for every apply, so the
    // native color well (which moves focus off the contenteditable) still targets the right range.
    let markRange: { from: number; to: number } | null = null;

    const is = (type: MarkType): boolean => activeMarks().includes(type);

    const openPicker = (which: "color" | "hl"): void => {
        setPop((p) => {
            const next = p === which ? null : which;
            if (next) markRange = textSelection();
            return next;
        });
    };
    const applyMark = (type: "color" | "hl", value: string | undefined): void => {
        if (value) setTextMark(type, value, markRange ?? undefined);
        else clearTextMark(type, markRange ?? undefined);
    };

    const openLink = (): void => {
        linkRange = textSelection();
        setLinkUrl(activeValues().link ?? "");
        setPop((p) => (p === "link" ? null : "link"));
    };
    const applyLink = (): void => {
        const url = linkUrl().trim();
        if (url) setTextMark("link", url, linkRange ?? undefined);
        else clearTextMark("link", linkRange ?? undefined);
        setPop(null);
    };

    return (
        <>
            <For each={BOOL}>
                {(m) => (
                    <button
                        title={m.title}
                        class={btn(is(m.type))}
                        onMouseDown={noBlur}
                        onClick={() => toggleTextMark(m.type)}
                    >
                        <Icon name={m.icon} size={15} />
                    </button>
                )}
            </For>
            <button
                title="Inline code"
                class={btn(is("code"))}
                onMouseDown={noBlur}
                onClick={() => toggleTextMark("code")}
            >
                <Icon name="code" size={15} />
            </button>
            {sep()}

            {/* text color */}
            <div class="relative">
                <button
                    title="Text color"
                    class={btn(is("color"))}
                    onMouseDown={noBlur}
                    onClick={() => openPicker("color")}
                >
                    <span class="flex flex-col items-center gap-[3px]">
                        <Icon name="letterA" size={14} />
                        <span
                            class="h-[3px] w-3.5 rounded-full"
                            style={{ background: activeValues().color ?? "currentColor" }}
                        />
                    </span>
                </button>
                <Show when={pop() === "color"}>
                    <div class={popCls}>
                        <ColorPicker
                            value={activeValues().color}
                            swatches={textColorSwatches(editorTokens())}
                            onChange={(v) => applyMark("color", v)}
                            onPick={() => setPop(null)}
                            clearLabel="Remove color"
                            clearWhenEmpty
                            keepFocus
                        />
                    </div>
                </Show>
            </div>

            {/* highlight */}
            <div class="relative">
                <button
                    title="Highlight"
                    class={btn(is("hl"))}
                    onMouseDown={noBlur}
                    onClick={() => openPicker("hl")}
                >
                    <span class="flex flex-col items-center gap-[3px]">
                        <Icon name="highlighter" size={14} />
                        <span
                            class="h-[3px] w-3.5 rounded-full"
                            style={{ background: activeValues().hl ?? "transparent" }}
                        />
                    </span>
                </button>
                <Show when={pop() === "hl"}>
                    <div class={popCls}>
                        <ColorPicker
                            value={activeValues().hl}
                            swatches={highlightSwatches(editorTokens())}
                            onChange={(v) => applyMark("hl", v)}
                            onPick={() => setPop(null)}
                            clearLabel="Remove highlight"
                            clearWhenEmpty
                            keepFocus
                        />
                    </div>
                </Show>
            </div>

            {/* link */}
            <div class="relative">
                <button
                    title="Link"
                    class={btn(is("link"))}
                    onMouseDown={noBlur}
                    onClick={openLink}
                >
                    <Icon name="link" size={15} />
                </button>
                <Show when={pop() === "link"}>
                    <div class="absolute left-1/2 top-full z-50 mt-2 flex w-[248px] -translate-x-1/2 items-center gap-1.5 rounded-xl border border-line bg-panel/95 p-2 shadow-2xl backdrop-blur-md">
                        <input
                            class="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
                            placeholder="https://…"
                            value={linkUrl()}
                            onInput={(e) => setLinkUrl(e.currentTarget.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    applyLink();
                                }
                            }}
                        />
                        <button
                            class="flex-none rounded-md bg-accent px-2 py-1 text-[12px] font-semibold text-onaccent"
                            onClick={applyLink}
                        >
                            {activeValues().link ? "Save" : "Add"}
                        </button>
                    </div>
                </Show>
            </div>
        </>
    );
};
