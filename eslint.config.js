import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

// Boundary law (model · canvas · ui · editor · app): each layer may only reach the ones beneath it.
// model (pure contract) ← canvas (render) ← ui (shared Solid) ← editor (edit) ← app (shell); services sees only model.
//
// Enforced twice on purpose. `import/no-restricted-paths` is the semantic check: it resolves each
// specifier to a real file, so it follows tsconfig `paths` and catches dynamic `import()`. It is also
// the one that failed silently for months when no TS-aware resolver was installed — an unresolvable
// specifier is skipped, not reported. `no-restricted-imports` re-states each zone against the raw
// specifier string, so it needs no resolution and cannot go quiet the same way.
const LAYERS = {
    model: {
        aliases: ["@canvas", "@engine", "@elements", "@ui", "@editor"],
        dirs: ["canvas", "ui", "editor", "services", "app"],
        message:
            "model is the pure contract: it must not depend on canvas, ui, editor, services, or app",
    },
    canvas: {
        aliases: ["@ui", "@editor"],
        dirs: ["ui", "editor", "services", "app"],
        message: "canvas (render) may depend on model only, not ui, editor, services, or app",
    },
    ui: {
        aliases: ["@editor"],
        dirs: ["editor", "services", "app"],
        message: "ui (shared Solid components) may depend on model, @themes, and canvas only",
    },
    editor: {
        aliases: [],
        dirs: ["services", "app"],
        message: "editor may depend on model, canvas, and ui only, not services or app",
    },
    app: {
        aliases: [],
        dirs: ["services"],
        message: "app is the browser SPA: it talks to services over HTTP, it must not import it",
    },
    services: {
        aliases: ["@canvas", "@engine", "@elements", "@ui", "@editor"],
        dirs: ["canvas", "ui", "editor", "app"],
        message: "services (backend) may depend on model only, not canvas, ui, editor, or app",
    },
};

const zones = Object.entries(LAYERS).map(([target, { dirs, message }]) => ({
    target: `./${target}`,
    from: dirs.map((d) => `./${d}`),
    message,
}));

// Same law, resolver-free: match the specifier text itself (alias form and relative form).
const boundaryConfigs = Object.entries(LAYERS).map(([target, { aliases, dirs, message }]) => ({
    files: [`${target}/**/*.{ts,tsx}`],
    rules: {
        "no-restricted-imports": [
            "error",
            {
                patterns: [
                    {
                        group: [...aliases.map((a) => `${a}/*`), ...dirs.map((d) => `**/${d}/**`)],
                        message,
                    },
                ],
            },
        ],
        // no-restricted-imports ignores dynamic import(); this covers it.
        "no-restricted-syntax": [
            "error",
            {
                selector: `ImportExpression[source.value=/^(${[
                    ...aliases.map((a) => `${a}\\/`),
                    ...dirs.map((d) => `(\\.\\.\\/)+${d}\\/`),
                ].join("|")})/]`,
                message,
            },
        ],
    },
}));

export default tseslint.config(
    {
        // Build output and generated artifacts only. Anything hand-written is linted, including the
        // root *.config.ts files and this file; a blanket "*.config.*" used to exempt them silently.
        ignores: [
            "**/dist/**",
            "**/migrations/**",
            "coverage/**",
            ".gen/**",
            ".docs/**",
            ".claude/**",
        ],
    },
    {
        linterOptions: {
            // A suppression that stops being necessary must fail, not warn. Paired with noInlineConfig
            // (the repo carries zero inline suppressions; a new one goes through this file instead).
            reportUnusedDisableDirectives: "error",
            noInlineConfig: true,
        },
    },
    ...tseslint.configs.recommended,
    {
        plugins: { import: importPlugin },
        settings: {
            // Without a TS-aware resolver every .ts/.tsx and every `@alias/*` specifier fails to
            // resolve, and import/no-restricted-paths silently checks nothing.
            "import/resolver": { typescript: { project: "./tsconfig.json" } },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "no-console": "error",
            // The preset allows @ts-expect-error with a description; the repo allows none of them, so
            // the error lands in the editor rather than at CI (scripts/check-suppressions.mjs).
            "@typescript-eslint/ban-ts-comment": [
                "error",
                {
                    "ts-expect-error": true,
                    "ts-ignore": true,
                    "ts-nocheck": true,
                    "ts-check": true,
                },
            ],
            "import/no-restricted-paths": ["error", { zones }],
        },
    },
    ...boundaryConfigs,
);
