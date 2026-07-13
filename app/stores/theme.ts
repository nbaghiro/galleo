import { createSignal } from "solid-js";
import { resolveTheme, registerThemes, themeCssVars } from "@themes";
import type { JSX } from "solid-js";
import type { Theme, Tokens } from "@themes";
import { api, type ApiTheme } from "../api";
import { useLocation } from "@solidjs/router";
import { editorTokens } from "@editor/editor";
import type { ElementInstance, Section } from "@model/artifact";

// app-chrome theme (distinct from a deck's artifact theme); persisted so it survives logout
const KEY = "galleo:app-theme";
const DEFAULT = "brut";

// localStorage can throw when storage is blocked — never break boot
let stored: string | null = null;
try {
    stored = localStorage.getItem(KEY);
} catch {
    /* storage unavailable — use default */
}

export const [appTheme, setAppThemeSignal] = createSignal(stored || DEFAULT);

export function setAppTheme(id: string): void {
    setAppThemeSignal(id);
    try {
        localStorage.setItem(KEY, id);
    } catch {
        /* storage unavailable */
    }
}

// live, non-persisted override — theme editor's draft, recolors the app behind the modal
const [appThemeOverride, setAppThemeOverride] = createSignal<Tokens | null>(null);
export { appThemeOverride };
export function setAppThemePreview(tokens: Tokens | null): void {
    setAppThemeOverride(tokens);
}

export function appThemeVars(): JSX.CSSProperties {
    return themeCssVars(appThemeOverride() ?? resolveTheme(appTheme()).tokens) as JSX.CSSProperties;
}

const [themeEditorOpen, setThemeEditorOpen] = createSignal(false);

export { themeEditorOpen };

export function openThemeEditor(): void {
    setThemeEditorOpen(true);
}

export function closeThemeEditor(): void {
    setThemeEditorOpen(false);
}

// editor route sets this to the artifact theme while editing; else falls back to app-chrome
const [faviconOverride, setFaviconOverride] = createSignal<string | null>(null);
export { faviconOverride, setFaviconOverride };

export function setFavicon(tokens: Tokens): void {
    const rx = Math.max(1.5, Math.min(9, tokens.radius * 0.42)).toFixed(2);
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
        `<rect width="32" height="32" rx="${rx}" fill="${tokens.accent}"/>` +
        `<text x="16.5" y="23.3" font-family="Georgia,'Times New Roman',serif" font-size="23" ` +
        `font-weight="700" fill="${tokens.onAccent}" text-anchor="middle">G</text>` +
        `</svg>`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// overlays over the editor adopt the artifact/editor theme (else app-chrome), to match the surface underneath
export const editorThemeCssVars = (): JSX.CSSProperties =>
    themeCssVars(editorTokens()) as JSX.CSSProperties;

// call once in the component body: stamps the theme at open (reads untracked), won't restyle while previewed underneath
export function overlayThemeVars(): JSX.CSSProperties | undefined {
    return useLocation().pathname.includes("/edit/") ? editorThemeCssVars() : undefined;
}

const tx = (text: string, style: string): ElementInstance => ({
    type: "text",
    data: { text, style },
});
const button = (label: string): ElementInstance => ({ type: "button", data: { label } });
const group = (...children: ElementInstance[]): ElementInstance => ({
    type: "group",
    data: { children },
});

export const THEME_SAMPLE: Section = {
    id: "theme-sample",
    root: group(
        tx("Galleo · design system", "label"),
        tx("A theme you can feel", "h1"),
        tx("One token set themes every surface — decks, docs, and sites alike.", "subtitle"),
        button("Get started"),
    ),
};

// localStorage cache so a reload hydrates custom themes synchronously (no default flash before the fetch)
const CUSTOM_KEY = "galleo:custom-themes";
function readCustomCache(): Theme[] {
    try {
        const list = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]") as Theme[];
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

const cachedCustom = readCustomCache();
if (cachedCustom.length) registerThemes(cachedCustom); // resolve custom themes before first render
const [customThemes, setCustomThemes] = createSignal<Theme[]>(cachedCustom);
let loaded = false;

export { customThemes };

function toTheme(a: ApiTheme): Theme {
    return { id: a.id, name: a.name, tag: a.mood ?? "custom", dark: a.isDark, tokens: a.tokens };
}

function sync(list: Theme[]): void {
    // register into the (non-reactive) @themes map before flipping the signal, so the re-render resolves custom themes
    registerThemes(list);
    setCustomThemes(list);
    try {
        localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
    } catch {
        /* storage unavailable — cache skipped */
    }
}

// drop on sign-out so another account never inherits it; re-arm the one-shot load
export function clearCustomThemes(): void {
    loaded = false;
    registerThemes([]);
    setCustomThemes([]);
    try {
        localStorage.removeItem(CUSTOM_KEY);
    } catch {
        /* ignore */
    }
}

export async function loadCustomThemes(): Promise<void> {
    if (loaded) return;
    loaded = true;
    try {
        const r = await api.listThemes();
        sync(r.themes.map(toTheme));
    } catch {
        loaded = false;
    }
}

export interface ThemeDraft {
    name: string;
    tokens: Tokens;
    tag: string;
    dark: boolean;
}

export async function saveCustomTheme(d: ThemeDraft): Promise<Theme | null> {
    try {
        const { theme } = await api.createTheme({
            name: d.name,
            tokens: d.tokens,
            mood: d.tag,
            isDark: d.dark,
        });
        const t = toTheme(theme);
        sync([...customThemes(), t]);
        return t;
    } catch {
        return null;
    }
}

export async function updateCustomTheme(id: string, d: ThemeDraft): Promise<Theme | null> {
    try {
        const { theme } = await api.updateTheme(id, {
            name: d.name,
            tokens: d.tokens,
            mood: d.tag,
            isDark: d.dark,
        });
        const t = toTheme(theme);
        sync(customThemes().map((x) => (x.id === id ? t : x)));
        return t;
    } catch {
        return null;
    }
}

export function removeCustomTheme(id: string): void {
    sync(customThemes().filter((t) => t.id !== id));
    api.deleteTheme(id).catch(() => {});
}
