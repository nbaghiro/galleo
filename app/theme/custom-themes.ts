import { createSignal } from "solid-js";
import type { Theme, Tokens } from "@themes/theme";
import { registerThemes } from "@themes/library";
import { api, type ApiTheme } from "../data/api";

// User-created themes for the workspace — loaded from the backend, registered with the @themes
// registry so they resolve by id like built-ins (in artifacts AND previews), and listed in the theme
// drawer. Mutations are optimistic; the registry is re-synced on every change.
const [customThemes, setCustomThemes] = createSignal<Theme[]>([]);
let loaded = false;

export { customThemes };

function toTheme(a: ApiTheme): Theme {
    return { id: a.id, name: a.name, tag: a.mood ?? "custom", dark: a.isDark, tokens: a.tokens };
}

function sync(list: Theme[]): void {
    setCustomThemes(list);
    registerThemes(list);
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
