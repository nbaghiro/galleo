import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

const abs = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// The COMPONENT project — renders Solid components in happy-dom. Separate from the unit config (which runs
// in node and can't transform JSX or resolve solid's client build). `vite-plugin-solid` compiles the JSX
// and `resolve.conditions: browser` makes `solid-js` resolve to its client build, so `@solidjs/router` and
// friends stop throwing "Client-only API on the server". Collect only `*.test.tsx`, so the fast `*.test.ts`
// unit suite is untouched. Run: `pnpm exec vitest run -c vitest.component.config.ts`.
export default defineConfig({
    plugins: [solid()],
    resolve: {
        conditions: ["development", "browser"],
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
        environment: "happy-dom",
        include: ["**/*.test.tsx"],
        setupFiles: ["ui/test/setup.ts"],
    },
});
