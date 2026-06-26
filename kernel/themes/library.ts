import type { Theme } from "@themes/theme";

// A starter set of distinct themes. Each is just a token set; the editor swaps `artifact.theme` and
// everything re-colors.

const studio: Theme = {
    id: "studio",
    name: "Studio",
    tokens: {
        bg: "#f4f0e8",
        surface: "#fffdf8",
        ink: "#211c16",
        soft: "#5b5346",
        muted: "#8c8273",
        accent: "#9a4f24",
        onAccent: "#ffffff",
        line: "#eae3d5",
        radius: 18,
    },
};

const midnight: Theme = {
    id: "midnight",
    name: "Midnight",
    tokens: {
        bg: "#14161c",
        surface: "#1e2129",
        ink: "#f3f5f8",
        soft: "#c2c8d2",
        muted: "#8b93a3",
        accent: "#5ad1c8",
        onAccent: "#0c1116",
        line: "#2c313c",
        radius: 16,
    },
};

const editorial: Theme = {
    id: "editorial",
    name: "Editorial",
    tokens: {
        bg: "#f3f1ec",
        surface: "#ffffff",
        ink: "#1a1a1a",
        soft: "#444444",
        muted: "#8a8a8a",
        accent: "#c2402c",
        onAccent: "#ffffff",
        line: "#e4e0d8",
        radius: 4,
    },
};

const botanic: Theme = {
    id: "botanic",
    name: "Botanic",
    tokens: {
        bg: "#eef1e9",
        surface: "#fbfdf7",
        ink: "#1f2a20",
        soft: "#46553f",
        muted: "#7d8a76",
        accent: "#4a7c3f",
        onAccent: "#ffffff",
        line: "#dfe5d6",
        radius: 14,
    },
};

const marine: Theme = {
    id: "marine",
    name: "Marine",
    tokens: {
        bg: "#eaeff3",
        surface: "#ffffff",
        ink: "#16222e",
        soft: "#3e5161",
        muted: "#7e8b98",
        accent: "#1f7a8c",
        onAccent: "#ffffff",
        line: "#d9e1e8",
        radius: 12,
    },
};

const blossom: Theme = {
    id: "blossom",
    name: "Blossom",
    tokens: {
        bg: "#f7eef1",
        surface: "#fffafc",
        ink: "#2c1f29",
        soft: "#5e4a57",
        muted: "#9a8693",
        accent: "#b5417e",
        onAccent: "#ffffff",
        line: "#ecdde4",
        radius: 22,
    },
};

export const THEME_LIST: Theme[] = [studio, midnight, editorial, botanic, marine, blossom];
export const DEFAULT_THEME = studio;
export const THEMES: Record<string, Theme> = Object.fromEntries(THEME_LIST.map((t) => [t.id, t]));

export function resolveTheme(id: string): Theme {
    return THEMES[id] ?? DEFAULT_THEME;
}
