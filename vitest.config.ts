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
            // Every layer, so an untested one shows as 0% instead of being invisible. Note the
            // services/** figure counts unit tests only — its API routes are covered by `test:int`.
            include: ["model/**", "canvas/**", "ui/**", "editor/**", "app/**", "services/**"],
            exclude: [
                "**/*.test.ts",
                "**/*.itest.ts",
                "**/testkit.ts",
                "**/*.testkit.ts",
                "**/__tests__/**",
                "**/*.d.ts",
                // IO shell (pdf-lib, canvas.toBlob, window.print) dominates; pure geometry tested in export.test.ts
                "canvas/render/export.ts",
                // browser/network IO (pptxgenjs, jszip, fetch) dominates; pure sections tested in pptx.test.ts
                "canvas/render/pptx.ts",
                // offline model-eval harness, run by hand and never imported by the product
                "services/ai/eval/**",
                // seed + starter content: data, exercised end-to-end by the integration suite
                "services/demos/**",
                "services/templates/**",
                "services/seed.ts",
                // drizzle-generated snapshots/journal (json), not source
                "services/migrations/**",
            ],
            // Floors, not targets: set just under today's numbers so a real regression fails while
            // ordinary churn does not. Raise them when a layer genuinely improves.
            thresholds: {
                lines: 40,
                statements: 40,
                functions: 42,
                branches: 40,
                "model/**": { lines: 90, statements: 90, functions: 90, branches: 80 },
                "canvas/engine/**": { lines: 95, statements: 95, functions: 95, branches: 90 },
                "canvas/elements/**": { lines: 85, statements: 85, functions: 85, branches: 70 },
            },
        },
    },
});
