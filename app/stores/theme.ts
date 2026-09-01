import { createSignal } from "solid-js";
import { resolveTheme, registerThemes, themeCssVars } from "@themes";
import type { JSX } from "solid-js";
import type { Theme, Tokens } from "@themes";
import { api, type ApiTheme, type UserPrefs } from "@app/api";
import { useLocation } from "@solidjs/router";
import { editorTokens } from "@editor/core/store";
import type { ElementInstance, Section } from "@model/artifact";

// app-chrome theme (distinct from a deck's artifact theme). The account row is the source of truth,
// so the choice follows the user to another browser; localStorage is a cache that paints the right
// theme on the first frame, before /me answers.
const KEY = "galleo:app-theme";
const DEFAULT = "studio";

// localStorage can throw when storage is blocked — never break boot
let stored: string | null = null;
try {
    stored = localStorage.getItem(KEY);
} catch {
    /* storage unavailable — use default */
}

export const [appTheme, setAppThemeSignal] = createSignal(stored || DEFAULT);

function cacheAppTheme(id: string): void {
    setAppThemeSignal(id);
    try {
        localStorage.setItem(KEY, id);
    } catch {
        /* storage unavailable */
    }
}

export function setAppTheme(id: string): void {
    if (id === appTheme()) return;
    cacheAppTheme(id);
    // signed out (the auth screen themes itself) this 401s, which is not worth surfacing
    void api.updatePrefs({ appTheme: id }).catch(() => {});
}

// The account's stored choice, applied at whatever point the user becomes known. Local-only, so a
// login on a second browser adopts the account theme without echoing it straight back.
export function adoptUserPrefs(prefs: UserPrefs): void {
    if (prefs.appTheme && prefs.appTheme !== appTheme()) cacheAppTheme(prefs.appTheme);
}

// live, non-persisted: the theme editor's draft recolors the app behind the modal
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

// overlays adopt the editor's theme, to match the surface underneath
export const editorThemeCssVars = (): JSX.CSSProperties =>
    themeCssVars(editorTokens()) as JSX.CSSProperties;

// call once in the component body: stamps the theme at open, not on later previews
export function overlayThemeVars(): JSX.CSSProperties | undefined {
    return useLocation().pathname.includes("/edit/") ? editorThemeCssVars() : undefined;
}

const tx = (text: string, style: string): ElementInstance => ({
    type: "text",
    data: { text, style },
});
const button = (label: string): ElementInstance => ({ type: "button", data: { label } });
const group = (...children: ElementInstance[]): ElementInstance => ({
    type: "container",
    data: { children },
});

export const THEME_SAMPLE: Section = {
    id: "theme-sample",
    root: group(
        tx("Galleo · design system", "label"),
        tx("A theme you can feel", "h1"),
        tx("One token set themes every surface: decks, docs, and sites alike.", "subtitle"),
        button("Get started"),
    ),
};

// localStorage cache so a reload hydrates custom themes with no default flash before the fetch
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
    // register into the non-reactive @themes map before flipping the signal, so the re-render resolves
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

// the server can create a theme mid-session (an imported template adopts one), and until it is
// registered `resolveTheme` answers with the default
export async function refreshCustomThemes(): Promise<void> {
    loaded = false;
    await loadCustomThemes();
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
