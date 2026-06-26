import { build } from "esbuild";

// Bundles the studio demo (kernel engine + elements + DOM backend) into a single classic
// script so the demo HTML opens directly via file:// — no dev server needed.

await build({
    entryPoints: ["surfaces/studio/main.ts"],
    bundle: true,
    format: "iife",
    target: "es2020",
    outfile: "surfaces/studio/demo.js",
    resolveExtensions: [".ts", ".js"],
    alias: {
        "@model": "./kernel/model",
        "@engine": "./kernel/engine",
        "@elements": "./kernel/elements",
        "@text": "./kernel/text",
        "@themes": "./kernel/themes",
        "@render": "./kernel/render",
    },
    logLevel: "info",
});
