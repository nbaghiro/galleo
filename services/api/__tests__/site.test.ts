import { describe, expect, it } from "vitest";
import { siteRouter } from "@services/api/site";
import { makeSession, SESSION_COOKIE } from "@services/utils/auth";

const files: Record<string, string> = {
    "marketing/home.html":
        '<h1>Create presentations</h1><link rel="canonical" href="https://galleo.app/">',
    "marketing/ai-presentation-maker.html": "<h1>AI presentation maker</h1>",
    "app/index.html": '<meta name="robots" content="noindex"><div id="root"></div>',
    "robots.txt": "User-agent: *\nAllow: /\nSitemap: https://galleo.app/sitemap.xml\n",
    "sitemap.xml":
        '<?xml version="1.0"?><urlset><url><loc>https://galleo.app/</loc></url></urlset>',
};
const router = siteRouter(
    {
        "/": "marketing/home.html",
        "/ai-presentation-maker": "marketing/ai-presentation-maker.html",
    },
    async (file) => {
        const content = files[file];
        if (!content) throw new Error(`Missing file: ${file}`);
        return content;
    },
);

describe("public site routing", () => {
    it("serves crawler files with their real media types, not the app shell", async () => {
        const robots = await router.request("/robots.txt");
        expect(robots.status).toBe(200);
        expect(robots.headers.get("content-type")).toContain("text/plain");
        expect(await robots.text()).toContain("Sitemap: https://galleo.app/sitemap.xml");
        const sitemap = await router.request("/sitemap.xml");
        expect(sitemap.headers.get("content-type")).toContain("application/xml");
        expect(await sitemap.text()).toContain("<urlset>");
    });
    it("serves crawlable public HTML and redirects duplicate paths", async () => {
        const page = await router.request("/ai-presentation-maker");
        expect(await page.text()).toContain("<h1>AI presentation maker</h1>");
        expect(page.headers.get("x-robots-tag")).toBeNull();
        const slash = await router.request("/ai-presentation-maker/?source=link");
        expect(slash.status).toBe(301);
        expect(slash.headers.get("location")).toBe("/ai-presentation-maker?source=link");
        expect((await router.request("/home")).headers.get("location")).toBe("/");
    });
    it("answers unknown pages and missing assets with 404", async () => {
        for (const path of [
            "/missing",
            "/missing.html",
            "/favicon-missing.svg",
            "/constructor",
            "/__proto__",
            "/edit",
            "/login/missing",
        ]) {
            const response = await router.request(path);
            expect(response.status, path).toBe(404);
            expect(response.headers.get("x-robots-tag")).toBe("noindex");
        }
    });
    it("preserves app deep links without indexing sign-in screens", async () => {
        for (const path of [
            "/login",
            "/signup",
            "/edit/123",
            "/present/123",
            "/templates",
            "/settings/billing/activity",
            "/invite/token",
            "/pricing?status=success",
        ]) {
            const response = await router.request(path);
            expect(response.status, path).toBe(200);
            expect(response.headers.get("x-robots-tag")).toBe("noindex");
            expect(await response.text()).toContain('id="root"');
        }
        expect((await router.request("/pricing")).headers.get("location")).toBe("/#pricing");
    });
    it("keeps the signed-in root and marketing escape route usable without cache leaks", async () => {
        const headers = { Cookie: `${SESSION_COOKIE}=${makeSession("seo-test")}` };
        const home = await router.request("/", { headers });
        expect(home.headers.get("x-robots-tag")).toBe("noindex");
        expect(home.headers.get("cache-control")).toContain("private");
        const marketing = await router.request("/home", { headers });
        expect(marketing.status).toBe(200);
        expect(await marketing.text()).toContain('href="https://galleo.app/"');
    });
});
