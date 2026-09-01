import { defineConfig, devices } from "@playwright/test";

import { E2E_BASE, E2E_DB, E2E_PORT } from "./e2e/env";

// E2E runs the BUILT app in production mode on its own port and database, so the suite can run
// beside the dev stack (8600/8601) without touching it. Full plan: .docs/e2e-implementation-plan.md

export default defineConfig({
    testDir: "./e2e",
    globalSetup: "./e2e/setup/global.ts",
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: E2E_BASE,
        trace: "retain-on-failure",
        contextOptions: { reducedMotion: "reduce" },
    },
    projects: [
        { name: "auth-states", testMatch: /states\.setup\.ts/ },
        {
            // `plans` moves the demo login onto the free workspace, and `users.activeWorkspaceId` is
            // one server-side pointer per person rather than one per browser: every context signed
            // in as demo reads the free plan for as long as it runs. So it goes first, alone, and
            // everything sharing that login waits for it (see e2e/plans/plans.spec.ts).
            name: "plans",
            testMatch: /plans\/.*\.spec\.ts/,
            dependencies: ["auth-states"],
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "smoke",
            testMatch: /smoke\/.*\.spec\.ts/,
            dependencies: ["auth-states", "plans"],
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "editor",
            testMatch: /editor\/.*\.spec\.ts/,
            dependencies: ["auth-states", "plans"],
            use: { ...devices["Desktop Chrome"], storageState: "e2e/.state/demo.json" },
        },
        {
            name: "roles",
            testMatch: /roles\/.*\.spec\.ts/,
            dependencies: ["auth-states", "plans"],
            use: { ...devices["Desktop Chrome"] },
        },
        {
            name: "share",
            testMatch: /share\/.*\.spec\.ts/,
            dependencies: ["auth-states", "plans"],
            use: { ...devices["Desktop Chrome"], storageState: "e2e/.state/demo.json" },
        },
        {
            name: "library",
            testMatch: /library\/.*\.spec\.ts/,
            dependencies: ["auth-states", "plans"],
            use: { ...devices["Desktop Chrome"], storageState: "e2e/.state/demo.json" },
        },
        { name: "auth", testMatch: /auth\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
        {
            name: "phone",
            testMatch: /phone\/.*\.spec\.ts/,
            dependencies: ["auth-states", "plans"],
            use: { ...devices["Pixel 7"], storageState: "e2e/.state/demo.json" },
        },
        {
            name: "present",
            testMatch: /present\/.*\.spec\.ts/,
            dependencies: ["auth-states", "plans"],
            use: { ...devices["Desktop Chrome"], storageState: "e2e/.state/demo.json" },
        },
        {
            name: "ai",
            testMatch: /ai\/.*\.spec\.ts/,
            dependencies: ["auth-states", "plans"],
            retries: 0, // a live retry is a hidden re-spend; fake mode is deterministic anyway
            use: { ...devices["Desktop Chrome"], storageState: "e2e/.state/demo.json" },
        },
    ],
    webServer: {
        command: "pnpm build && pnpm exec tsx services/server.ts",
        url: `${E2E_BASE}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        env: {
            NODE_ENV: "production",
            PORT: String(E2E_PORT),
            // one suite performs more honest logins than the human-scale window admits
            RATE_LIMIT_SCALE: "20",
            DATABASE_URL: E2E_DB,
            APP_URL: E2E_BASE,
            // constant is fine: the database is throwaway and the strong-secret rule only guards prod
            SESSION_SECRET: "e2e-0f3f9b2c7d1e4a68b5c2d9e7f4a1b8c6",
            // scripted model by default; E2E_LIVE_AI=1 hands the AI project the platform keys
            GALLEO_FAKE_AI: process.env.E2E_LIVE_AI ? "0" : "1",
            // The server loads .env, and dotenv leaves a key that is already present alone, so this
            // blank is what stops a signup in the suite from mailing a real address.
            RESEND_API_KEY: "",
        },
    },
});
