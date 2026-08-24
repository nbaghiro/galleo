/* @refresh reload */
import "@ui/styles.css";
import "./website.css";
import { render } from "solid-js/web";
import { registerThemes, resolveTheme, themeCssVars, type Theme } from "@themes";
import { setFavicon } from "@ui/brand";
import { initAnalytics } from "@ui/analytics";
import { WebsitePage } from "./WebsitePage";

// keep in sync with app/stores/theme.ts (KEY · DEFAULT · CUSTOM_KEY)
const APP_THEME_KEY = "galleo:app-theme";
const CUSTOM_KEY = "galleo:custom-themes";
const DEFAULT = "studio";

// Register the app's cached custom themes explicitly; the store side effect is tree-shaken here.
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

// The landing page is where paid traffic arrives, so this is the one surface where a page view is
// the event: it carries the referrer and the click id (fbclid and friends), which PostHog persists
// and applies to the person when they later sign up.
initAnalytics("marketing");

const root = document.getElementById("root");
if (root) {
    const tokens = resolveTheme(read()).tokens;
    const vars = themeCssVars(tokens);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    setFavicon(tokens);
    render(() => <WebsitePage />, root);
}
