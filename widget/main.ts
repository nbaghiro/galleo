import "@elements/register"; // side-effect: registers the element library the engine paints
import type { ArtifactContent } from "@model/artifact";
import type { ArtifactRef } from "@model/ai";
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
// One script serves both `ui://` components, because the two share everything except the last step:
// the host bridge, the engine, and the payload guard are the same, and only the paint differs.
//
// The host hands the tool result in over postMessage (MCP Apps) and, in ChatGPT, also on
// `window.openai`. Both are read, because a client may implement either.

type Payload =
    | { kind: "artifact"; content: ArtifactContent }
    | { kind: "sections"; content: ArtifactContent }
    | { kind: "library"; artifacts: ArtifactRef[] };

const WIDTH = 960; // the layout width to solve at; the result is scaled to whatever box the host gives
const CARD = 300; // a preview card's painted width
const CARD_MAX = 380; // and the tallest one grows before the rest is clipped

// The list chrome has no artifact behind it and so no theme to wear. It follows the host instead,
// which is the only signal a transparent frame in somebody else's dark mode leaves us.
const CHROME = `
:root{color-scheme:light dark;--g-card:#fff;--g-line:rgba(0,0,0,.12);--g-ink:#15171c;--g-soft:#5c6270;--g-chip:rgba(0,0,0,.05)}
@media (prefers-color-scheme:dark){:root{--g-card:#1d1e23;--g-line:rgba(255,255,255,.13);--g-ink:#e9ebf0;--g-soft:#9aa1ae;--g-chip:rgba(255,255,255,.08)}}
#root{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--g-ink);overflow:hidden}
.g-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:10px;padding:12px}
.g-item{background:var(--g-card);border:1px solid var(--g-line);border-radius:10px;padding:12px}
.g-badge{display:inline-block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--g-soft);background:var(--g-chip);border-radius:5px;padding:2px 6px}
.g-name{margin-top:8px;font-weight:600;overflow-wrap:anywhere}
.g-meta{margin-top:4px;font-size:12px;color:var(--g-soft)}
.g-note{padding:16px;color:var(--g-soft)}
.g-head{padding:12px 12px 0;font-size:12px}
.g-rail{display:flex;gap:12px;padding:12px;overflow-x:auto;overscroll-behavior-x:contain}
.g-frame{overflow:hidden;border-radius:8px;border:1px solid var(--g-line)}
.g-cap{margin-top:6px;font-size:12px;text-align:center}
`;

const FORMAT_NAME: Record<string, string> = { deck: "Deck", doc: "Doc", web: "Site" };

const root = document.getElementById("root");

const el = (tag: string, cls: string, text?: string): HTMLElement => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text) node.textContent = text;
    return node;
};

const updated = (iso: string | undefined): string => {
    const at = iso ? new Date(iso) : null;
    if (!at || Number.isNaN(at.getTime())) return "";
    return `Updated ${at.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
};

function paintArtifact(host: HTMLElement, content: ArtifactContent): void {
    const tokens = resolveTheme(content.theme).tokens;
    const profile = profileFor({ format: content.format });
    const inner = document.createElement("div");
    host.appendChild(inner);
    const { height } = paintSectionStack(inner, content.sections, profile, tokens, {
        fullW: WIDTH,
        cache: createSectionStackCache(),
    });
    const scale = (host.clientWidth || WIDTH) / WIDTH;
    inner.style.cssText = scaledHostCss(WIDTH, height, scale);
    // a transform does not shrink the box it sits in, so the frame would keep the unscaled height
    host.style.height = `${Math.round(height * scale)}px`;
    host.style.background = backdropCss(content.background, tokens);
}

function paintSections(host: HTMLElement, content: ArtifactContent): void {
    const tokens = resolveTheme(content.theme).tokens;
    const profile = profileFor({ format: content.format });
    const scale = CARD / WIDTH;
    const count = content.sections.length;

    const head = el("div", "g-head", count === 1 ? "1 section" : `${count} sections`);
    head.style.color = tokens.muted;
    const rail = el("div", "g-rail");

    const frames: HTMLElement[] = [];
    let tallest = 0;

    content.sections.forEach((section, i) => {
        const frame = el("div", "g-frame");
        frame.style.width = `${CARD}px`;
        frame.style.background = backdropCss(content.background, tokens);
        const inner = document.createElement("div");
        frame.appendChild(inner);
        const { height } = paintSectionStack(inner, [section], profile, tokens, {
            fullW: WIDTH,
            slideFrame: profile.kind === "paged",
        });
        inner.style.cssText = scaledHostCss(WIDTH, height, scale);
        frames.push(frame);
        tallest = Math.max(tallest, Math.round(height * scale));

        const caption = el("div", "g-cap", String(i + 1));
        caption.style.color = tokens.muted;
        const card = document.createElement("div");
        card.append(frame, caption);
        rail.appendChild(card);
    });

    // one height for the row, so the captions line up and a long section is clipped rather than
    // dragging every card beside it taller
    const box = Math.min(tallest, CARD_MAX);
    for (const frame of frames) frame.style.height = `${box}px`;

    host.append(head, rail);
    host.style.background = backdropCss(content.background, tokens);
}

function paintLibrary(host: HTMLElement, artifacts: ArtifactRef[]): void {
    if (!artifacts.length) {
        // it covers an empty library as well as a search that found nothing, and cannot tell them apart
        host.appendChild(el("div", "g-note", "No pieces to show."));
        return;
    }
    const grid = el("div", "g-grid");
    for (const row of artifacts) {
        const item = el("div", "g-item");
        item.append(
            el("div", "g-badge", FORMAT_NAME[row.format] ?? row.format),
            el("div", "g-name", row.title),
        );
        const when = updated(row.updatedAt);
        if (when) item.appendChild(el("div", "g-meta", when));
        grid.appendChild(item);
    }
    host.appendChild(grid);
}

// `_meta` rather than `structuredContent`: the render payload is for this component, and the model
// should not pay context for a tree it cannot read.
function readPayload(value: unknown): Payload | null {
    const raw = (value ?? {}) as {
        kind?: string;
        content?: ArtifactContent;
        artifacts?: ArtifactRef[];
    };
    const content = raw.content;
    if (
        (raw.kind === "artifact" || raw.kind === "sections") &&
        content &&
        Array.isArray(content.sections) &&
        content.sections.length
    )
        return { kind: raw.kind, content };
    if (raw.kind === "library" && Array.isArray(raw.artifacts))
        return {
            kind: "library",
            artifacts: raw.artifacts.filter((a) => typeof a?.id === "string"),
        };
    return null;
}

let shown: Payload | null = null;
let shownAt = 0; // the width it was painted for, so a resize that changes nothing repaints nothing

function render(payload: Payload): void {
    if (!root) return;
    shown = payload;
    root.textContent = "";
    root.removeAttribute("style");
    shownAt = root.clientWidth;
    if (payload.kind === "library") paintLibrary(root, payload.artifacts);
    else if (payload.kind === "sections") paintSections(root, payload.content);
    else paintArtifact(root, payload.content);
}

function readResult(result: unknown): void {
    const meta = (result as { _meta?: { galleo?: unknown } } | undefined)?._meta?.galleo;
    const payload = readPayload(meta);
    if (payload) render(payload);
}

const chrome = document.createElement("style");
chrome.textContent = CHROME;
document.head.appendChild(chrome);

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
    if (!root || !shown || root.clientWidth === shownAt) return;
    render(shown);
});
