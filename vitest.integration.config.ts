import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// The backend INTEGRATION project — Hono routes against a real throwaway Postgres (docker `galleo-pg`).
// Separate from the unit config so it stays opt-in (`vitest run -c vitest.integration.config.ts`) and out
// of the fast/no-Docker suite. globalSetup creates + migrates `galleo_test`; each test truncates first.
// Only the truly-external services (LLM/Stripe/mail/clock) are faked per test — DB/SQL/auth run for real.
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
        globalSetup: ["services/test/global-setup.ts"],
        setupFiles: ["services/test/setup.ts"],
        fileParallelism: false, // one shared DB — serialize files so truncation can't race
        env: {
            DATABASE_URL: "postgres://galleo:galleo@localhost:8602/galleo_test",
            SESSION_SECRET: "integration-test-secret",
        },
        hookTimeout: 30000,
        testTimeout: 20000,
    },
});
