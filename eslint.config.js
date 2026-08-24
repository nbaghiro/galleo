import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

// Boundary law (model · canvas · ui · editor · app): each layer may only reach the ones beneath it.
// model (pure contract) ← canvas (render) ← ui (shared Solid) ← editor (edit) ← app (shell); services sees only model.
//
// The spine is not the whole map. publish, website and widget are their own builds, siblings of app
// rather than layers above it, and each is capped at what it actually is: the two Solid viewers stop
// at ui, and the MCP widget stops at canvas, since admitting ui would admit Solid and the point of
// that bundle is that the layout solver ships without a framework. scripts and e2e are tooling that
// composes across the layers, so they are capped only where a dependency would be a mistake: build
// tooling must not reach the product shells, and a browser spec must drive the real thing over HTTP
// and the DOM rather than calling a store or a query directly.
//
// Enforced twice on purpose. `import/no-restricted-paths` is the semantic check: it resolves each
// specifier to a real file, so it follows tsconfig `paths` and catches dynamic `import()`. It is also
// the one that failed silently for months when no TS-aware resolver was installed — an unresolvable
// specifier is skipped, not reported. `no-restricted-imports` re-states each zone against the raw
// specifier string, so it needs no resolution and cannot go quiet the same way.
const LAYERS = {
    model: {
        aliases: ["@canvas", "@engine", "@elements", "@ui", "@editor", "@app", "@services"],
        dirs: ["canvas", "ui", "editor", "services", "app"],
        message:
            "model is the pure contract: it must not depend on canvas, ui, editor, services, or app",
    },
    canvas: {
        aliases: ["@ui", "@editor", "@app", "@services"],
        dirs: ["ui", "editor", "services", "app"],
        message: "canvas (render) may depend on model only, not ui, editor, services, or app",
    },
    ui: {
        aliases: ["@editor", "@app", "@services"],
        dirs: ["editor", "services", "app"],
        message: "ui (shared Solid components) may depend on model, @themes, and canvas only",
    },
    editor: {
        aliases: ["@app", "@services"],
        dirs: ["services", "app"],
        message: "editor may depend on model, canvas, and ui only, not services or app",
    },
    app: {
        aliases: ["@services"],
        dirs: ["services"],
        message: "app is the browser SPA: it talks to services over HTTP, it must not import it",
    },
    services: {
        aliases: ["@canvas", "@engine", "@elements", "@ui", "@editor", "@app"],
        dirs: ["canvas", "ui", "editor", "app"],
        message: "services (backend) may depend on model only, not canvas, ui, editor, or app",
    },
    publish: {
        aliases: ["@editor", "@app", "@services"],
        dirs: ["editor", "services", "app"],
        message:
            "publish is its own build for a customer's audience: model, canvas and ui only. Its client is publish/api.ts, not @app/api",
    },
    website: {
        aliases: ["@editor", "@app", "@services"],
        dirs: ["editor", "services", "app"],
        message: "website is its own build: model, canvas and ui only, never the app SPA",
    },
    widget: {
        aliases: ["@ui", "@editor", "@app", "@services"],
        dirs: ["ui", "editor", "services", "app"],
        message:
            "the MCP widget is framework-free by design: model and canvas only, since @ui would pull Solid into a bundle that travels in someone else's chat",
    },
    scripts: {
        aliases: ["@editor", "@app"],
        dirs: ["editor", "app"],
        message:
            "scripts is build tooling: it may compose model, canvas and services, never a shell",
    },
};

// e2e drives a real browser against a real server, so a spec that imports the product can cheat:
// call a store instead of clicking, or query the database instead of the API. Bound to specs alone,
// since setup/ legitimately shells out to `pnpm seed`.
const E2E_SPECS = {
    aliases: ["@canvas", "@engine", "@elements", "@ui", "@editor", "@app", "@services"],
    dirs: ["canvas", "ui", "editor", "app", "services"],
    message:
        "an e2e spec drives the app over HTTP and the DOM: @model for shared types, never the product's own modules",
};

const zones = [
    ...Object.entries(LAYERS).map(([target, { dirs, message }]) => ({
        target: `./${target}`,
        from: dirs.map((d) => `./${d}`),
        message,
    })),
    {
        target: "./e2e/**/*.spec.ts",
        from: E2E_SPECS.dirs.map((d) => `./${d}`),
        message: E2E_SPECS.message,
    },
];

// Layer law inside services/, the same shape as the outer one one level down:
//
//     api  →  core  →  db  →  utils
//
// api holds one file per resource and does HTTP only: parse, gate, shape a response. core holds one
// file per functionality and owns every decision and every query; it may NOT import hono, which is what
// keeps the split honest. db is the schema, the lazy handle, and the derived-column writer. utils is
// database-free by rule, so everything in it stays unit-testable.
//
// Two consequences worth stating, because both were discovered by trying the alternative: the
// entitlement resolver lives in @model/billing rather than services, since utils needed it and may not
// reach up; and db/client.ts builds an inert handle instead of throwing at import, so a unit test can
// import a core module without a database. The entry points assert a real URL instead.
//
// Entry points compose across layers by definition, so the law binds libraries, not entries. There are
// exactly two, both named in package.json.
const ENTRY_POINTS = ["services/server.ts", "services/db/seed.ts"];
const SERVICE_LAYERS = ["utils", "db", "core", "api"];
const aboveOf = (layer) => SERVICE_LAYERS.slice(SERVICE_LAYERS.indexOf(layer) + 1);

const LAYER_MSG = (layer, above) =>
    `services layer law: ${layer} may not import ${above.join(", ")} (api \u2192 core \u2192 db \u2192 utils; move shared code down, never up)`;

// Restates the services layer patterns, since a second no-restricted-imports block for the same file
// replaces the first rather than adding to it.
const serviceLayerConfigs = SERVICE_LAYERS.map((layer) => {
    const above = aboveOf(layer);
    const patterns = [
        {
            group: [
                ...LAYERS.services.aliases.map((a) => `${a}/*`),
                ...LAYERS.services.dirs.map((d) => `**/${d}/**`),
            ],
            message: LAYERS.services.message,
        },
    ];
    // matches by segment: the canonical `@services/domain/x` spelling and any relative form alike
    if (above.length)
        patterns.push({ group: above.map((d) => `**/${d}/**`), message: LAYER_MSG(layer, above) });
    // The whole point of the api/core split: a core file that reaches for hono is a route in disguise.
    if (layer === "core")
        patterns.push({
            group: ["hono", "hono/*"],
            message:
                "domain holds business logic, not routes: hono belongs in api/ (see api/middleware.ts)",
        });
    return {
        files: [`services/${layer}/**/*.ts`],
        ignores: ENTRY_POINTS,
        rules: { "no-restricted-imports": ["error", { patterns }] },
    };
});

// The zone target is a glob so the entry points fall outside it: `**/` matches zero segments, and
// the extglob drops the entry by name. `except` would not do this — it filters `from`, not `target`.
const ENTRY_NAMES = ENTRY_POINTS.map((f) => f.split("/").pop().replace(/\.ts$/, ""));
const serviceLayerZones = SERVICE_LAYERS.filter((l) => aboveOf(l).length).map((layer) => ({
    target: `./services/${layer}/**/!(${ENTRY_NAMES.join("|")}).ts`,
    from: aboveOf(layer).map((d) => `./services/${d}/**`),
    message: LAYER_MSG(layer, aboveOf(layer)),
}));

// `digest` and `search_text` are derived from `draft_content` in services/core/derived.ts and must be
// written with it, or they drift silently. Both drizzle write shapes are covered: an inline
// `.values({…})`/`.set({…})` and a patch object assembled first. Reads (`draftContent: a.draftContent`
// in a response DTO) and the column declaration in schema.ts are not `.values()`/`.set()` arguments,
// so they do not match.
const DERIVED_MSG =
    "write artifact content with contentColumns() (services/core/artifacts.ts) so digest + search_text cannot drift and every media url is adopted as an asset";
const derivedGuard = [
    {
        selector:
            "CallExpression[callee.property.name=/^(values|set)$/] > ObjectExpression > Property[key.name='draftContent']",
        message: DERIVED_MSG,
    },
    { selector: "AssignmentExpression[left.property.name='draftContent']", message: DERIVED_MSG },
    // contentWrite alone derives the columns but leaves foreign media urls in the tree, which is
    // what makes the library incomplete; contentColumns is the pair.
    { selector: "CallExpression[callee.name='contentWrite']", message: DERIVED_MSG },
];

// Dynamic import() escapes no-restricted-imports, so the layer law restates it as a selector.
const importGuard = ({ aliases, dirs, message }) => ({
    selector: `ImportExpression[source.value=/^(${[
        ...aliases.map((a) => `${a}\\/`),
        ...dirs.map((d) => `(\\.\\.\\/)+${d}\\/`),
    ].join("|")})/]`,
    message,
});

// Extra selectors folded into a layer's own no-restricted-syntax, since a second config block for the
// same rule would replace the layer's entry rather than add to it. scripts is here for that reason:
// it writes the same derived columns, and before it had a layer entry it carried its own block.
const EXTRA_SYNTAX = { services: derivedGuard, scripts: derivedGuard };

// scripts holds .mjs guards alongside its .ts, and they are bound by the same law.
const FILES = { scripts: ["scripts/**/*.{ts,tsx,mjs}"] };

const restrictedImports = ({ aliases, dirs, message }) => [
    "error",
    {
        patterns: [
            { group: [...aliases.map((a) => `${a}/*`), ...dirs.map((d) => `**/${d}/**`)], message },
        ],
    },
];

// Same law, resolver-free: match the specifier text itself (alias form and relative form).
const boundaryConfigs = Object.entries(LAYERS).map(([target, layer]) => ({
    files: FILES[target] ?? [`${target}/**/*.{ts,tsx}`],
    rules: {
        "no-restricted-imports": restrictedImports(layer),
        "no-restricted-syntax": ["error", importGuard(layer), ...(EXTRA_SYNTAX[target] ?? [])],
    },
}));

const e2eSpecConfig = {
    files: ["e2e/**/*.spec.ts"],
    rules: {
        "no-restricted-imports": restrictedImports(E2E_SPECS),
        "no-restricted-syntax": ["error", importGuard(E2E_SPECS)],
    },
};

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
            "import/no-restricted-paths": ["error", { zones: [...zones, ...serviceLayerZones] }],
            // cross-directory imports use aliases; only `./sibling` stays relative. The ignore is
            // load-bearing: the rule resolves specifiers to files, so without it an alias whose target
            // sits in a parent directory (all of them) is flagged too.
            "import/no-relative-parent-imports": ["error", { ignore: ["^@"] }],
        },
    },
    // scripts/ and publish/ have no alias, so their tests reach their subjects by relative path.
    {
        files: ["scripts/**/__tests__/**", "publish/**/__tests__/**"],
        rules: { "import/no-relative-parent-imports": "off" },
    },
    ...boundaryConfigs,
    ...serviceLayerConfigs,
    e2eSpecConfig,
    // The helper itself, and tests that deliberately seed partial or stale rows to exercise recovery.
    // Restates each side's own import guard, which this block would otherwise replace.
    {
        files: ["services/db/derived.ts", "services/core/artifacts.ts", "services/**/__tests__/**"],
        rules: { "no-restricted-syntax": ["error", importGuard(LAYERS.services)] },
    },
    {
        files: ["scripts/**/__tests__/**"],
        rules: { "no-restricted-syntax": ["error", importGuard(LAYERS.scripts)] },
    },
);
