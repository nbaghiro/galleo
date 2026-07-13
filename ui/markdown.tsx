import type { Component } from "solid-js";
import { createMemo } from "solid-js";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

export const Markdown: Component<{ text: string; muted?: boolean; class?: string }> = (props) => {
    const html = createMemo(() => {
        // `async: false` keeps parse synchronous; the return type still unions Promise, so narrow to string.
        const raw = marked.parse(props.text ?? "", { async: false }) as string;
        return DOMPurify.sanitize(raw);
    });
    // innerHTML is safe here: `html()` is DOMPurify-sanitized above.
    return (
        <div
            class={`md ${props.muted ? "md-muted" : ""} ${props.class ?? ""}`.trim()}
            innerHTML={html()}
        />
    );
};
