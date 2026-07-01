import { createSignal } from "solid-js";
import { resolveTheme } from "@themes/library";
import { themeCssVars } from "@themes/theme";
import type { JSX } from "solid-js";

// The app-chrome theme (auth, library, settings…) — distinct from a deck's artifact theme. Persisted
// to localStorage so the choice survives logout/login on this browser, and so the sign-in page already
// wears it before the user authenticates. Defaults to Concrete.
const KEY = "galleo:app-theme";
const DEFAULT = "brut";

// localStorage can throw when the browser blocks site storage — never let it break app boot.
let stored: string | null = null;
try {
    stored = localStorage.getItem(KEY);
} catch {
    /* storage unavailable — fall back to the default */
}

export const [appTheme, setAppThemeSignal] = createSignal(stored || DEFAULT);

export function setAppTheme(id: string): void {
    setAppThemeSignal(id);
    try {
        localStorage.setItem(KEY, id);
    } catch {
        /* storage unavailable — the choice lives in memory for this session */
    }
}

// CSS variables for the active app theme — set on the app root so every child (sign-in included)
// recolors via the shared Tailwind tokens.
export function appThemeVars(): JSX.CSSProperties {
    return themeCssVars(resolveTheme(appTheme()).tokens) as JSX.CSSProperties;
}
