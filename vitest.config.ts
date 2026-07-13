import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

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
            include: ["canvas/**", "model/**"],
            exclude: [
                "**/*.test.ts",
                "**/testkit.ts",
                "**/*.testkit.ts",
                "**/*.d.ts",
                // IO shell (pdf-lib, canvas.toBlob, window.print) dominates; pure geometry tested in export.test.ts
                "canvas/render/export.ts",
                // browser/network IO (pptxgenjs, jszip, fetch) dominates; pure sections tested in pptx.test.ts
                "canvas/render/pptx.ts",
            ],
        },
    },
});
