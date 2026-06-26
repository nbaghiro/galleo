import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// The studio is the Vite root; kernel is reached via the same path aliases as tsconfig.
export default defineConfig({
    root: "surfaces/studio",
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
    },
});
