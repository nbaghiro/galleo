import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

function appSpaFallback(): Plugin {
    return {
        name: "app-spa-fallback",
        configureServer(server) {
            server.middlewares.use((req, _res, next) => {
                const url = req.url ?? "";
                const isHtmlNav =
                    (req.headers.accept ?? "").includes("text/html") && !/\.\w+(\?|$)/.test(url);
                if (isHtmlNav) {
                    if (url.startsWith("/app") && url !== "/app/index.html")
                        req.url = "/app/index.html";
                    else if (url.startsWith("/p/")) req.url = "/publish/index.html";
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
