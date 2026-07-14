/* @refresh reload */
import "../ui/styles.css";
import "./website.css";
import { render } from "solid-js/web";
import { registerThemes, resolveTheme, themeCssVars, type Theme } from "@themes";
import { setFavicon } from "../app/stores/theme";
import { WebsitePage } from "./WebsitePage";

// keep in sync with app/stores/theme.ts (KEY · DEFAULT · CUSTOM_KEY)
const APP_THEME_KEY = "galleo:app-theme";
const CUSTOM_KEY = "galleo:custom-themes";
const DEFAULT = "brut";

// The app caches its workspace custom themes here; register them so a CUSTOM app-chrome theme resolves on
// this separate build too. Must be an explicit call in the entry — the app-store import's side effect that
// used to do this gets tree-shaken out of the production website bundle.
try {
    const custom = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]") as Theme[];
    if (Array.isArray(custom) && custom.length) registerThemes(custom);
} catch {
    /* storage / JSON unavailable */
}

function read(): string {
    try {
        return localStorage.getItem(APP_THEME_KEY) || DEFAULT;
    } catch {
        return DEFAULT;
    }
}

const root = document.getElementById("root");
if (root) {
    const tokens = resolveTheme(read()).tokens;
    const vars = themeCssVars(tokens);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    setFavicon(tokens);
    render(() => <WebsitePage />, root);
}
