import "dotenv/config"; // load SESSION_SECRET so the dev cookie check matches the backend
import type { Plugin } from "vite";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { readSession, SESSION_COOKIE } from "./services/utils/auth";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// Stamped onto every analytics event, so a regression can be bounded to a deploy. Render injects
// the sha; locally git has it; a tarball build with neither says so rather than guessing.
function appBuild(): string {
    const injected = process.env.RENDER_GIT_COMMIT?.trim();
    if (injected) return injected.slice(0, 7);
    try {
        return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    } catch {
        return "unknown";
    }
}

function cookieValue(header: string | undefined, name: string): string | undefined {
    for (const part of header?.split(";") ?? []) {
        const eq = part.indexOf("=");
        if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
    }
    return undefined;
}

// Must mirror the routing in services/server.ts, else localhost and prod disagree on "/".
function appSpaFallback(): Plugin {
    return {
        name: "app-spa-fallback",
        configureServer(server) {
            server.middlewares.use((req, _res, next) => {
                const url = req.url ?? "";
                // an iframe navigating to an API URL (a served PDF) accepts text/html too —
                // API paths belong to the proxy, never to the SPA fallback
                const isHtmlNav =
                    (req.headers.accept ?? "").includes("text/html") &&
                    !url.startsWith("/api/") &&
                    !/^\/(mcp|oauth|\.well-known)/.test(url) &&
                    !/\.\w+(\?|$)/.test(url);
                if (isHtmlNav) {
                    const path = url.split("?")[0] ?? url;
                    const authed =
                        readSession(cookieValue(req.headers.cookie, SESSION_COOKIE)) !== null;
                    if (path === "/home") req.url = "/index.html";
                    else if (path.startsWith("/p/")) req.url = "/publish/index.html";
                    else if (path === "/") req.url = authed ? "/app/index.html" : "/index.html";
                    else req.url = "/app/index.html";
                }
                next();
            });
        },
    };
}

export default defineConfig({
    root: ".",
    define: { "import.meta.env.VITE_APP_BUILD": JSON.stringify(appBuild()) },
    publicDir: "public", // the vendored fonts; the favicon is still set by setFavicon()
    server: {
        port: 8600,
        strictPort: true,
        // A tunnelled dev server is how an external MCP client (Claude, ChatGPT) reaches this
        // machine, and Vite refuses an unknown Host by default. Named suffixes rather than `true`,
        // so this stays a hole only the tunnels we actually use can come through.
        allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.io", ".loca.lt"],
        // Regex key, not "/api": a bare prefix would also swallow the /api.ts module request.
        proxy: {
            "^/api/": {
                target: "http://localhost:8601",
                changeOrigin: true,
                ws: true, // the collaboration socket upgrades on /api/artifacts/:id/collab
            },
            // root-mounted in prod because their paths are fixed by spec, so dev proxies them too
            // rather than letting the SPA fallback answer an MCP client with HTML
            "^/(mcp|oauth|\\.well-known)": {
                target: "http://localhost:8601",
                changeOrigin: true,
            },
        },
    },
    preview: { port: 8600, strictPort: true },
    plugins: [solid(), tailwindcss(), appSpaFallback()],
    resolve: {
        alias: {
            "@model": abs("./model"),
            "@engine": abs("./canvas/engine"),
            "@elements": abs("./canvas/elements"),
            "@themes": abs("./model/theme"),
            "@canvas": abs("./canvas"),
            "@ui": abs("./ui"),
            "@editor": abs("./editor"),
            "@app": abs("./app"),
            // no @services on purpose: a frontend import of services must fail the build
        },
    },
    build: {
        outDir: abs("./dist"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                website: abs("./index.html"),
                app: abs("./app/index.html"),
                publish: abs("./publish/index.html"),
                widget: abs("./widget/index.html"),
            },
        },
    },
});
