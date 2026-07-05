import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

// Boundary law (model · canvas · editor · app): each layer may only reach the ones beneath it.
// model (pure contract) ← canvas (render) ← editor (edit) ← app (shell); services sees only model.
export default tseslint.config(
    {
        ignores: [
            "**/dist/**",
            "**/migrations/**",
            "**/demo.js",
            "scripts/**",
            "*.config.*",
            ".docs/**",
            ".claude/**",
        ],
    },
    ...tseslint.configs.recommended,
    {
        plugins: { import: importPlugin },
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "no-console": "error",
            "import/no-restricted-paths": [
                "error",
                {
                    zones: [
                        {
                            target: "./model",
                            from: ["./canvas", "./editor", "./services", "./app"],
                            message:
                                "model is the pure contract — it must not depend on canvas, editor, services, or app",
                        },
                        {
                            target: "./canvas",
                            from: ["./editor", "./services", "./app"],
                            message:
                                "canvas (render) may depend on model only — not editor, services, or app",
                        },
                        {
                            target: "./services",
                            from: ["./canvas", "./editor", "./app"],
                            message:
                                "services (backend) may depend on model only — not canvas, editor, or app",
                        },
                    ],
                },
            ],
        },
    },
);
