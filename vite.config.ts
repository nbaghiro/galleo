import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// `app/` is the Vite root (the product shell); it composes the studio editor + shared theme. Kernel
// + studio are reached via the same path aliases as tsconfig. Galleo claims the 86xx host-port block
// so it runs alongside the other ~/Documents/code projects (clientbridge 87xx, …). See docs/ports.md.
export default defineConfig({
    root: "app",
    server: {
        port: 8600,
        strictPort: true,
        // Same-origin in dev: /api/* → the backend API (8601), so cookies work without CORS. The key
        // is a regex (leading ^) requiring the trailing slash, so it doesn't swallow the app/api.ts
        // module request (/api.ts), which a bare "/api" prefix would.
        proxy: {
            "^/api/": { target: "http://localhost:8601", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
        },
    },
    preview: { port: 8600, strictPort: true },
    plugins: [solid(), tailwindcss()],
    resolve: {
        alias: {
            "@model": abs("./kernel/model"),
            "@engine": abs("./kernel/engine"),
            "@elements": abs("./kernel/elements"),
            "@text": abs("./kernel/text"),
            "@themes": abs("./kernel/themes"),
            "@render": abs("./kernel/render"),
            "@data": abs("./services/data"),
            "@studio": abs("./surfaces/studio"),
        },
    },
    build: {
        outDir: abs("./dist"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: abs("./app/index.html"),
                playground: abs("./app/playground.html"),
            },
        },
    },
});
