import "@elements/register"; // side-effect: registers the element library the engine paints
import type { ArtifactContent } from "@model/artifact";
import { profileFor } from "@engine/profile";
import { resolveTheme } from "@themes";
import {
    backdropCss,
    createSectionStackCache,
    paintSectionStack,
    scaledHostCss,
} from "@canvas/render/backends";

declare global {
    interface Window {
        // set by ChatGPT when it renders the component; absent in every other host
        openai?: { toolOutput?: unknown };
    }
}

// The component an MCP host renders in its own chat. It is the real engine rather than a picture of
// one: `canvas/` is framework-free, so the whole layout solver bundles here with no app shell.
//
// The host hands the tool result in over postMessage (MCP Apps) and, in ChatGPT, also on
// `window.openai`. Both are read, because a client may implement either.

interface RenderPayload {
    content: ArtifactContent;
    title?: string;
}

const WIDTH = 960; // the layout width to solve at; the result is scaled to whatever box the host gives

const root = document.getElementById("root");

function paint(payload: RenderPayload): void {
    if (!root) return;
    const { content } = payload;
    if (!content?.sections?.length) return;
    const tokens = resolveTheme(content.theme).tokens;
    const profile = profileFor({ format: content.format });

    root.textContent = "";
    const inner = document.createElement("div");
    root.appendChild(inner);
    const { height } = paintSectionStack(inner, content.sections, profile, tokens, {
        fullW: WIDTH,
        cache: createSectionStackCache(),
    });
    const scale = (root.clientWidth || WIDTH) / WIDTH;
    inner.style.cssText = scaledHostCss(WIDTH, height, scale);
    root.style.background = backdropCss(content.background, tokens);
}

const isPayload = (v: unknown): v is RenderPayload =>
    !!v && typeof v === "object" && !!(v as RenderPayload).content?.sections;

// `_meta` rather than `structuredContent`: the render payload is for this component, and the model
// should not pay context for a tree it cannot read.
function readResult(result: unknown): void {
    const meta = (result as { _meta?: { galleo?: unknown } } | undefined)?._meta?.galleo;
    if (isPayload(meta)) paint(meta);
}

window.addEventListener("message", (e: MessageEvent) => {
    const msg = e.data as { method?: string; params?: { result?: unknown } } | undefined;
    if (msg?.method === "ui/notifications/tool-result") readResult(msg.params?.result);
});

// ChatGPT's own extension, offered alongside the shared bridge. Declared rather than asserted: the
// host puts it on window, so the honest form is to say what window has, not to cast at each read.
if (window.openai?.toolOutput) readResult(window.openai.toolOutput);

// tell the host the frame is ready for its first result
window.parent?.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized" }, "*");

window.addEventListener("resize", () => {
    if (window.openai?.toolOutput) readResult(window.openai.toolOutput);
});
