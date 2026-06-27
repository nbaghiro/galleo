import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// The studio is the Vite root; kernel is reached via the same path aliases as tsconfig.
// Galleo claims the 86xx host-port block so it runs alongside the other ~/Documents/code
// projects (clientbridge 87xx, llamatrade 88xx, sourcewell 89xx). See docs/ports.md.
export default defineConfig({
    root: "surfaces/studio",
    server: {
        port: 8600,
        strictPort: true,
        // Same-origin in dev: /api/* → the backend API (8601), so cookies work without CORS.
        proxy: {
            "/api": { target: "http://localhost:8601", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
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
        },
    },
    build: {
        outDir: abs("./dist"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: abs("./surfaces/studio/index.html"),
                playground: abs("./surfaces/studio/playground.html"),
            },
        },
    },
});
