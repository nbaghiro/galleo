import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { readSession, SESSION_COOKIE } from "@services/utils/auth";

// Keep aligned with the app's router and Vite's development fallback.
const APP_PATH =
    /^\/(?:app|login|signup|connect|welcome|templates|shared|trash|pricing(?:\/activity)?|settings(?:\/[^/]+){0,2}|account(?:\/[^/]+)?|(?:folder|invite|collab|edit|present)\/[^/]+)\/?$/;

export function siteRouter(
    pages: Readonly<Record<string, string>>,
    read: (file: string) => Promise<string>,
): Hono {
    const router = new Hono();
    router.get("/robots.txt", async (c) => c.text(await read("robots.txt")));
    router.get("/sitemap.xml", async (c) => {
        c.header("Content-Type", "application/xml; charset=utf-8");
        return c.body(await read("sitemap.xml"));
    });
    router.get("*", async (c) => {
        const path = c.req.path;
        const authed = readSession(getCookie(c, SESSION_COOKIE)) !== null;
        // Session-dependent responses must never be shared by an intermediary cache.
        c.header("Cache-Control", "private, no-cache");
        if (path === "/home" || path === "/home/") {
            if (!authed) return c.redirect("/", 301);
            return c.html(await read(pages["/"]!));
        }
        if (path.length > 1 && path.endsWith("/") && pages[path.slice(0, -1)]) {
            return c.redirect(`${path.slice(0, -1)}${new URL(c.req.url).search}`, 301);
        }
        if (path === "/pricing" && !authed && !new URL(c.req.url).search)
            return c.redirect("/#pricing", 301);
        const page = Object.hasOwn(pages, path) ? pages[path] : undefined;
        if (page && !(path === "/" && authed)) return c.html(await read(page));
        if ((path === "/" && authed) || APP_PATH.test(path)) {
            c.header("X-Robots-Tag", "noindex");
            return c.html(await read("app/index.html"));
        }
        c.header("X-Robots-Tag", "noindex");
        return c.html(
            '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | Galleo</title></head><body><main><h1>Page not found</h1><p>This address does not match a Galleo page.</p><a href="/">Go to Galleo</a></main></body></html>',
            404,
        );
    });
    return router;
}
