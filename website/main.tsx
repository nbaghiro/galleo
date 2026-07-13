/* @refresh reload */
import "../ui/styles.css";
import "./website.css";
import { render } from "solid-js/web";
import { resolveTheme, themeCssVars } from "@themes";
import { setFavicon } from "../app/stores/theme";
import { WebsitePage } from "./WebsitePage";

// theme key shared with the app + sign-in
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
    setFavicon(tokens);
    render(() => <WebsitePage />, root);
}
