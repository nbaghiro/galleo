import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

// Boundary rules (Kernel + Surfaces): the kernel stays pure; surfaces never import each other.
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
                            target: "./kernel",
                            from: ["./canvas", "./editor", "./services", "./app"],
                            message: "kernel must not depend on canvas, editor, services, or app",
                        },
                        {
                            target: "./canvas",
                            from: ["./editor", "./services", "./app"],
                            message:
                                "canvas (render) must not depend on the editor, services, or app",
                        },
                    ],
                },
            ],
        },
    },
);
