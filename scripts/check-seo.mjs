import { readFile, access } from "node:fs/promises";
import assert from "node:assert/strict";
import { Window } from "happy-dom";

function checkPage(html, path) {
    const window = new Window();
    const document = window.document;
    document.write(html);
    assert.equal(document.querySelectorAll("h1").length, 1, `${path}: one rendered h1 required`);
    assert.ok(document.querySelector("h1").textContent.trim().length > 5, `${path}: empty heading`);
    assert.ok(document.title.includes("Galleo"), `${path}: missing brand title`);
    assert.ok(
        document.querySelector('meta[name="description"]')?.content.length > 30,
        `${path}: description missing`,
    );
    assert.equal(
        document.querySelector('link[rel="canonical"]')?.href,
        `https://galleo.app${path}`,
        `${path}: wrong canonical`,
    );
    assert.ok(
        !document.querySelector('meta[name="robots"]')?.content.includes("noindex"),
        `${path}: public page is noindex`,
    );
    assert.equal(
        document.querySelector('meta[property="og:url"]')?.content,
        `https://galleo.app${path}`,
    );
    assert.equal(
        document.querySelector('meta[property="og:image"]')?.content,
        "https://galleo.app/social-card.png",
    );
    assert.ok(
        document.querySelector("#root[data-prerendered]")?.textContent.length > 500,
        `${path}: missing static content`,
    );
    assert.equal(document.querySelectorAll('a[href="#"]').length, 0, `${path}: placeholder link`);
    assert.equal(
        document.querySelector('script[type="module"]')?.hasAttribute("src"),
        true,
        `${path}: missing client entry`,
    );
    return document;
}

const manifest = JSON.parse(await readFile("dist/marketing.json", "utf8"));
assert.ok(manifest["/"], "missing homepage");
assert.ok(Object.keys(manifest).length >= 9, "missing public routes");
const sitemap = await readFile("dist/sitemap.xml", "utf8");
const robots = await readFile("dist/robots.txt", "utf8");
assert.ok(robots.includes("Sitemap: https://galleo.app/sitemap.xml"));
assert.ok(!robots.includes("Disallow: /\n"));
const titles = new Set();
const documents = new Map();
for (const [path, file] of Object.entries(manifest)) {
    const html = await readFile(`dist/${file}`, "utf8");
    const document = checkPage(html, path);
    documents.set(path, document);
    assert.ok(!titles.has(document.title), `${path}: duplicate title`);
    titles.add(document.title);
    assert.ok(sitemap.includes(`<loc>https://galleo.app${path}</loc>`), `${path}: not in sitemap`);
    if (path === "/") {
        assert.ok(
            document.querySelector('script[type="application/ld+json"]'),
            "missing site identity",
        );
        assert.ok(
            !document.body.textContent.includes("maja@ondine.dk"),
            "sample content leaked into the homepage",
        );
        for (const target of Object.keys(manifest).filter(
            (p) => p !== "/" && !p.startsWith("/docs/"),
        ))
            assert.ok(
                document.querySelector(`a[href="${target}"]`),
                `homepage does not link ${target}`,
            );
    }
    for (const link of document.querySelectorAll("a[href]")) {
        const href = link.getAttribute("href");
        if (href.startsWith("#"))
            assert.ok(document.getElementById(href.slice(1)), `${path}: broken fragment ${href}`);
        if (href.startsWith("/")) {
            const target = href.split(/[?#]/)[0];
            assert.ok(
                manifest[target] || ["/login", "/signup"].includes(target),
                `${path}: unknown internal link ${href}`,
            );
        }
    }
    // The guard must reject empty app shells and a public page accidentally marked noindex.
    assert.throws(() => checkPage(html.replace(/<h1\b[\s\S]*?<\/h1>/, ""), path));
    assert.throws(() =>
        checkPage(html.replace("</head>", '<meta name="robots" content="noindex"></head>'), path),
    );
}
const reachable = new Set();
const pending = ["/"];
while (pending.length) {
    const path = pending.pop();
    if (reachable.has(path)) continue;
    reachable.add(path);
    const document = documents.get(path);
    for (const link of document.querySelectorAll("a[href]")) {
        const target = new URL(link.getAttribute("href"), `https://galleo.app${path}`);
        if (target.origin !== "https://galleo.app") continue;
        const destination = documents.get(target.pathname);
        if (!destination) continue;
        if (target.hash)
            assert.ok(
                destination.getElementById(decodeURIComponent(target.hash.slice(1))),
                `${path}: broken cross-page fragment ${target.pathname}${target.hash}`,
            );
        pending.push(target.pathname);
    }
}
for (const path of documents.keys())
    assert.ok(reachable.has(path), `unreachable public page: ${path}`);
await access("dist/favicon.svg");
await access("dist/social-card.png");
assert.ok(
    (await readFile("dist/app/index.html", "utf8")).includes('name="robots" content="noindex"'),
);
process.stdout.write(
    `✓ ${titles.size} public pages have static content, unique metadata, working links and sitemap entries\n`,
);
