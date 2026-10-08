import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { renderToString, generateHydrationScript } from "solid-js/web";
import { resolveTheme, themeCssVars } from "@themes";
import { TEMPLATE_INDEX } from "@model/templates";
import { LegalPage } from "./LegalPage";
import { WebsitePage } from "./WebsitePage";
import { ContentPage } from "./ContentPage";
import { legalDocFor, marketingPageFor, metadataFor, PUBLIC_PATHS } from "./routes";

const origin = "https://galleo.app";
const escape = (value: string): string =>
    value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
const shell = await readFile("dist/index.html", "utf8");
const style = Object.entries(themeCssVars(resolveTheme("studio").tokens))
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
await mkdir("dist/marketing", { recursive: true });
const manifest: Record<string, string> = {};
for (const path of PUBLIC_PATHS) {
    const legal = legalDocFor(path);
    const page = marketingPageFor(path);
    const metadata = metadataFor(path);
    if (page?.templateId && !TEMPLATE_INDEX.some((entry) => entry.id === page.templateId))
        throw new Error(`Unknown template: ${page.templateId}`);
    const body = renderToString(() =>
        legal ? (
            <LegalPage doc={legal} />
        ) : page ? (
            <ContentPage page={page} />
        ) : (
            <WebsitePage theme="studio" />
        ),
    );
    const canonical = `${origin}${path}`;
    const structured =
        path === "/"
            ? `<script type="application/ld+json">${JSON.stringify({
                  "@context": "https://schema.org",
                  "@graph": [
                      {
                          "@type": "WebSite",
                          "@id": `${origin}/#website`,
                          name: "Galleo",
                          url: `${origin}/`,
                      },
                      {
                          "@type": "Organization",
                          "@id": `${origin}/#organization`,
                          name: "Galleo",
                          url: `${origin}/`,
                          logo: `${origin}/favicon.svg`,
                      },
                  ],
              }).replaceAll("<", "\\u003c")}</script>`
            : "";
    const html = shell
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(metadata.title)}</title>`)
        .replace(
            "</head>",
            `<meta name="description" content="${escape(metadata.description)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Galleo" />
<meta property="og:title" content="${escape(metadata.title)}" />
<meta property="og:description" content="${escape(metadata.description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${origin}/social-card.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Galleo: AI presentations, visual docs and websites" />
<meta name="twitter:card" content="summary_large_image" />
${structured}${generateHydrationScript()}</head>`,
        )
        .replace(
            '<div id="root"></div>',
            `<div id="root" data-prerendered style="${escape(style)}">${body}</div>`,
        );
    const file = `marketing/${path === "/" ? "home" : path.slice(1).replaceAll("/", "-")}.html`;
    await writeFile(`dist/${file}`, html);
    manifest[path] = file;
}
await writeFile("dist/marketing.json", JSON.stringify(manifest));
await writeFile("dist/robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(
    "dist/sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${PUBLIC_PATHS.map((path) => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>\n`,
);
await writeFile("dist/index.html", await readFile("dist/marketing/home.html", "utf8"));
await rm("dist/.prerender", { recursive: true, force: true });
