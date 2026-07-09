/* @refresh reload */
import "../ui/styles.css";
import "./website.css";
import { render } from "solid-js/web";
import { resolveTheme, themeCssVars } from "@themes";
import { setFavicon } from "../app/theme";
import { WebsitePage } from "./WebsitePage";

// Standalone website entry. Apply the user's persisted app theme (same key the app + sign-in use), so
// the landing matches the design they last selected. Read once — the website site is not a switcher.
function read(): string {
    try {
        return localStorage.getItem("galleo:app-theme") || "studio";
    } catch {
        return "studio";
    }
}

const root = document.getElementById("root");
if (root) {
    const tokens = resolveTheme(read()).tokens;
    const vars = themeCssVars(tokens);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    setFavicon(tokens); // the theme-badge favicon — the same one the app uses
    render(() => <WebsitePage />, root);
}
