import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// Single domain, two builds. The repo root is the Vite root so each entry sits at its public URL:
//   /         → index.html      → the website site (standalone, not the product SPA)
//   /app/*    → app/index.html  → the product SPA (SolidJS Router base "/app")
// In dev one server serves both; in prod the host routes / → website, /app/* → the app. This
// middleware gives the app SPA its client-side fallback in dev (/app/<anything> → app/index.html).
function appSpaFallback(): Plugin {
    return {
        name: "app-spa-fallback",
        configureServer(server) {
            server.middlewares.use((req, _res, next) => {
                const url = req.url ?? "";
                const isHtmlNav =
                    (req.headers.accept ?? "").includes("text/html") && !/\.\w+(\?|$)/.test(url);
                if (url.startsWith("/app") && url !== "/app/index.html" && isHtmlNav)
                    req.url = "/app/index.html";
                next();
            });
        },
    };
}

export default defineConfig({
    root: ".",
    publicDir: false, // the favicon is set dynamically by setFavicon(); no static public assets
    server: {
        port: 8600,
        strictPort: true,
        // Same-origin in dev: /api/* → the backend API (8601), so cookies work without CORS. The key
        // is a regex (leading ^) requiring the trailing slash, so it doesn't swallow the app/api.ts
        // module request (/api.ts), which a bare "/api" prefix would.
        proxy: {
            "^/api/": {
                target: "http://localhost:8601",
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/api/, ""),
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
            },
        },
    },
});
