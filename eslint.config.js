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
                            from: ["./surfaces", "./services", "./render", "./app"],
                            message: "kernel must not depend on surfaces, services, render, or app",
                        },
                        {
                            target: "./render",
                            from: ["./surfaces", "./services", "./app"],
                            message:
                                "render (shared paint layer) must not depend on a surface, services, or app",
                        },
                        {
                            target: "./surfaces/studio",
                            from: [
                                "./surfaces/present",
                                "./surfaces/publish",
                                "./surfaces/export",
                                "./surfaces/agent",
                            ],
                            message: "a surface must not import another surface",
                        },
                    ],
                },
            ],
        },
    },
);
