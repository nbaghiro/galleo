import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// Vitest runs the pure layers (model + canvas) in a plain `node` environment — the engine, profile,
// geometry, ops, and compose are framework-free TS, so no Solid/Tailwind plugin chain is needed (that
// keeps the suite fast). A DOM-backend test opts into a browser-like environment per file with a
// `// @vitest-environment happy-dom` docblock. Aliases mirror vite.config.ts so imports resolve the same
// way tests do in the app build. Component (.tsx) testing is a separate future project — it will add the
// vite-plugin-solid transform + happy-dom by default; see .docs/testing.md.
export default defineConfig({
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
    test: {
        environment: "node",
        include: ["**/*.test.ts"],
        exclude: ["**/node_modules/**", "**/dist/**"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            reportsDirectory: "coverage",
            // The pure, engine-level surface this suite targets. UI/editor/app/services are out of scope
            // here (component + backend tracks come later) so they don't drag the denominator down.
            include: ["canvas/**", "model/**"],
            exclude: [
                "**/*.test.ts",
                "**/testkit.ts",
                "**/*.testkit.ts",
                "**/*.d.ts",
                // PDF/PNG/print IO shell (pdf-lib, canvas.toBlob, URL.createObjectURL, window.print). Its
                // pure page geometry now lives in export-geometry.ts (tested); only this shell is excluded.
                "canvas/render/export.ts",
            ],
        },
    },
});
