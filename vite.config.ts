import "dotenv/config"; // load SESSION_SECRET so the dev cookie check matches the backend
import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { readSession, SESSION_COOKIE } from "./services/utils/auth";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

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
    publicDir: false, // favicon set dynamically by setFavicon(); no static assets
    server: {
        port: 8600,
        strictPort: true,
        // Regex key, not "/api": a bare prefix would also swallow the /api.ts module request.
        proxy: {
            "^/api/": {
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
            },
        },
    },
});
