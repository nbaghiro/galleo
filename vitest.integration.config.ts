import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@model": abs("./model"),
            "@themes": abs("./model/theme"),
            "@engine": abs("./canvas/engine"),
            "@elements": abs("./canvas/elements"),
            "@canvas": abs("./canvas"),
            "@ui": abs("./ui"),
            "@editor": abs("./editor"),
        },
    },
    test: {
        environment: "node",
        include: ["**/*.itest.ts"],
        globalSetup: ["services/__tests__/global-setup.ts"],
        setupFiles: ["services/__tests__/setup.ts"],
        fileParallelism: false, // one shared DB — serialize files so truncation can't race
        env: {
            DATABASE_URL: "postgres://galleo:galleo@localhost:8602/galleo_test",
            SESSION_SECRET: "integration-test-secret",
        },
        hookTimeout: 30000,
        testTimeout: 20000,
    },
});
