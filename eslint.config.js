import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

// Boundary rules (Kernel + Surfaces): the kernel stays pure; surfaces never import each other.
export default tseslint.config(
    {
        ignores: ["**/dist/**", "**/migrations/**", "*.config.*", "design/**", "docs/**"],
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
                            from: ["./surfaces", "./services"],
                            message: "kernel must not depend on surfaces or services",
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
