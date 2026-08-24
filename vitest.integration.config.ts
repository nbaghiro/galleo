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
            "@app": abs("./app"),
            "@services": abs("./services"),
        },
    },
    test: {
        environment: "node",
        include: ["**/*.itest.ts"],
        globalSetup: ["services/__tests__/global-setup.ts"],
        setupFiles: ["services/__tests__/setup.ts"],
        fileParallelism: false, // one shared DB — serialize files so truncation can't race
        env: {
            // GALLEO_TEST_DB lets concurrent local runs isolate onto their own database
            // (global-setup creates it on first use); CI and the default stay galleo_test
            DATABASE_URL: `postgres://galleo:galleo@localhost:8602/${process.env.GALLEO_TEST_DB ?? "galleo_test"}`,
            SESSION_SECRET: "integration-test-secret",
            RESEND_API_KEY: "", // a test must never reach the mail provider
        },
        hookTimeout: 30000,
        testTimeout: 20000,
    },
});
