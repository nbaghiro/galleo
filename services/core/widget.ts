import { readFileSync } from "node:fs";
import { appUrl } from "@services/utils/env";

// The HTML an MCP host renders in its iframe. It is a shell rather than the whole bundle: the
// script is served from our own origin, which the component's CSP names, so the resource stays small
// enough to travel in a tool result.
//
// Dev and production find that script differently. Vite serves the entry module by path, while a
// build emits a hashed asset whose name only the built html knows, so production reads it back out.

export const WIDGET_MIME = "text/html;profile=mcp-app";

// Two components, one shell. They paint different things but share the whole host bridge (the
// postMessage result, ChatGPT's `window.openai`, the ready handshake) and the same layout engine,
// so a second entry would duplicate both and ship the engine twice; the script branches on which
// payload arrived instead. The uris stay separate because a host names the template per tool.
export const COMPONENTS = [
    {
        uri: "ui://galleo/artifact",
        name: "Galleo artifact",
        description: "A deck, document or site rendered by Galleo's own engine.",
    },
    {
        uri: "ui://galleo/list",
        name: "Galleo list",
        description: "Pieces found in the library, or the sections inside one piece.",
    },
] as const;

export const ARTIFACT_URI = COMPONENTS[0].uri;
export const LIST_URI = COMPONENTS[1].uri;

export const isComponentUri = (uri: string | undefined): uri is string =>
    COMPONENTS.some((c) => c.uri === uri);

const DEV_SCRIPTS = ["/@vite/client", "/widget/main.ts"];

let cached: string | null = null;

function scriptPaths(): string[] {
    if (process.env.NODE_ENV !== "production") return DEV_SCRIPTS;
    try {
        const html = readFileSync("./dist/widget/index.html", "utf8");
        return [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]!);
    } catch {
        // a server running without a build still answers, with a frame that says so
        return [];
    }
}

export function widgetHtml(): string {
    if (cached) return cached;
    const scripts = scriptPaths();
    const tags = scripts
        .map((src) => `<script type="module" src="${appUrl(src)}"></script>`)
        .join("");
    const body = tags
        ? '<div id="root"></div>'
        : '<div style="padding:16px;font:13px system-ui">This preview needs a build of the Galleo widget.</div>';
    cached = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${appUrl("/fonts.css")}"><style>html,body{margin:0;background:transparent}</style></head><body>${body}${tags}</body></html>`;
    return cached;
}

// The exact origins the component fetches from, which both directories check at review. Kept beside
// the html so a new dependency cannot be added without the allowlist moving with it.
export const widgetCsp = (): Record<string, string[]> => ({
    connectDomains: [appUrl("")],
    resourceDomains: [appUrl("")],
    frameDomains: [],
});
