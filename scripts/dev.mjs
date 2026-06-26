import { context } from "esbuild";

// Watch + serve the studio demo for the implementation loop.
// Edit any kernel/* or surfaces/studio/* file, then refresh the browser.

const ctx = await context({
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

await ctx.watch();
const { port } = await ctx.serve({ servedir: "surfaces/studio", port: 5173 });
process.stdout.write(`\n  galleo studio → http://localhost:${port}/index.html  (watching; refresh to see edits)\n\n`);
