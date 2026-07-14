import "dotenv/config"; // load SESSION_SECRET so the dev cookie check matches the backend
import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { readSession, SESSION_COOKIE } from "./services/auth";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

function cookieValue(header: string | undefined, name: string): string | undefined {
    for (const part of header?.split(";") ?? []) {
        const eq = part.indexOf("=");
        if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
    }
    return undefined;
}

// Mirror the production server (services/server.ts) so localhost behaves identically: contextual "/"
// (the app when a valid session cookie is present, else marketing), /home = marketing, /p/* = publish,
// everything else = the app SPA.
function appSpaFallback(): Plugin {
    return {
        name: "app-spa-fallback",
        configureServer(server) {
            server.middlewares.use((req, _res, next) => {
                const url = req.url ?? "";
                const isHtmlNav =
                    (req.headers.accept ?? "").includes("text/html") && !/\.\w+(\?|$)/.test(url);
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
        // regex key (^ + trailing slash) so it doesn't swallow the /api.ts module request a bare "/api" would.
        // No rewrite: the backend mounts routers under /api, so dev forwards /api/* verbatim, matching prod.
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
