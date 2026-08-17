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
            "@app": abs("./app"),
            "@services": abs("./services"),
        },
    },
    test: {
        environment: "node",
        include: ["**/*.test.ts"],
        // `.browser.test.ts` launches real Chromium: too heavy for the unit run, where launching one
        // per worker contends and flakes. The `visual` CI job runs them explicitly instead.
        exclude: ["**/node_modules/**", "**/dist/**", "**/*.browser.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            reportsDirectory: "coverage",
            // Every layer, so an untested one reads 0% instead of vanishing; services/** is unit-only
            // here, its routes are covered by `test:int`.
            include: ["model/**", "canvas/**", "ui/**", "editor/**", "app/**", "services/**"],
            exclude: [
                "**/*.test.ts",
                "**/*.itest.ts",
                "**/testkit.ts",
                "**/*.testkit.ts",
                "**/__tests__/**",
                "**/*.d.ts",
                // IO shell dominates; pure geometry tested in export.test.ts
                "canvas/render/export.ts",
                // IO shell dominates; pure sections tested in pptx.test.ts
                "canvas/render/pptx.ts",
                // offline eval harness + the on-demand key/model prober, never imported by the product
                "services/core/ai/eval/**",
                // seed data, exercised end-to-end by the integration suite
                "services/core/ai/corpus/**",
                "services/core/templates.ts",
                "services/db/seed.ts",
                // drizzle-generated json, not source
                "services/db/migrations/**",
            ],
            // Floors, not targets: just under today's numbers, so a regression fails but churn does not.
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
