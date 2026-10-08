import { DocsPage } from "./DocsPage";
import { docFor } from "./docs";
/* @refresh reload */
import "@ui/styles.css";
import "./website.css";
import { hydrate, render } from "solid-js/web";
import { resolveTheme, themeCssVars } from "@themes";
import { initAnalytics } from "@ui/analytics";
import { LegalPage } from "./LegalPage";
import { legalDocFor, marketingPageFor } from "./routes";
import { ContentPage } from "./ContentPage";

initAnalytics("marketing");
const root = document.getElementById("root");
if (root) {
    for (const [key, value] of Object.entries(themeCssVars(resolveTheme("studio").tokens)))
        root.style.setProperty(key, value);
    const docs =
        window.location.pathname.replace(/\/$/, "") === "/docs" ||
        !!docFor(window.location.pathname);
    const legal = legalDocFor(window.location.pathname);
    const page = marketingPageFor(window.location.pathname);
    const WebsitePage =
        !legal && !page && !docs ? (await import("./WebsitePage")).WebsitePage : undefined;
    const view = () =>
        docs ? (
            <DocsPage article={docFor(window.location.pathname)} />
        ) : legal ? (
            <LegalPage doc={legal} />
        ) : page ? (
            <ContentPage page={page} />
        ) : WebsitePage ? (
            <WebsitePage theme="studio" />
        ) : null;
    if (root.hasAttribute("data-prerendered")) hydrate(view, root);
    else render(view, root);
}
