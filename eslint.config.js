import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

// Boundary law (model · canvas · ui · editor · app): each layer may only reach the ones beneath it.
// model (pure contract) ← canvas (render) ← ui (shared Solid) ← editor (edit) ← app (shell); services sees only model.
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
                            from: ["./canvas", "./ui", "./editor", "./services", "./app"],
                            message:
                                "model is the pure contract — it must not depend on canvas, ui, editor, services, or app",
                        },
                        {
                            target: "./canvas",
                            from: ["./ui", "./editor", "./services", "./app"],
                            message:
                                "canvas (render) may depend on model only — not ui, editor, services, or app",
                        },
                        {
                            target: "./ui",
                            from: ["./editor", "./services", "./app"],
                            message:
                                "ui (shared Solid components) may depend on model, @themes, and canvas — not editor, services, or app",
                        },
                        {
                            target: "./services",
                            from: ["./canvas", "./ui", "./editor", "./app"],
                            message:
                                "services (backend) may depend on model only — not canvas, ui, editor, or app",
                        },
                    ],
                },
            ],
        },
    },
);
