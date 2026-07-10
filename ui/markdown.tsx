import type { Component } from "solid-js";
import { createMemo } from "solid-js";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Markdown renderer for assistant / AI prose — parse (marked) → sanitize (DOMPurify) → render. Streaming-safe:
// it re-parses the growing text on every change (marked is sub-millisecond for chat-sized replies), so a live
// token stream renders formatted as it arrives. Styled theme-aware via the `.md` block in ui/styles.css, so it
// recolors with the active theme like every other @ui atom — no hardcoded colors. Sanitizing makes it safe to
// render even though the source is model output, not trusted HTML.

marked.setOptions({ gfm: true, breaks: true });

export const Markdown: Component<{ text: string; class?: string }> = (props) => {
    const html = createMemo(() => {
        // `async: false` keeps parse synchronous; the return type still unions Promise, so narrow to string.
        const raw = marked.parse(props.text ?? "", { async: false }) as string;
        return DOMPurify.sanitize(raw);
    });
    // innerHTML is safe here: `html()` is DOMPurify-sanitized above.
    return <div class={`md ${props.class ?? ""}`.trim()} innerHTML={html()} />;
};
