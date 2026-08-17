import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Tests that launch real Chromium. Kept out of the unit run (one browser per worker contends and
// flakes) and run on their own in CI's `visual` job, where a browser is already installed.
// The base config is spread rather than merged: mergeConfig concatenates `include`, which would
// pull the whole unit suite back in.
export default defineConfig({
    ...base,
    test: {
        ...base.test,
        include: ["**/*.browser.test.ts"],
        exclude: ["**/node_modules/**", "**/dist/**"],
        fileParallelism: false, // each file drives its own browser
        testTimeout: 120_000,
    },
});
