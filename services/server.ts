import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { readSession, SESSION_COOKIE } from "./auth";
import { session } from "./api/session";
import { artifacts } from "./api/artifacts";
import { folders } from "./api/folders";
import { themes } from "./api/themes";
import { templates } from "./api/templates";
import { billing } from "./api/billing";
import { features } from "./api/features";
import { media } from "./api/media";
import { ai } from "./api/ai";
import { links } from "./api/links";

const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));

// Routers carry their own full paths and mount under /api, matching the client's relative /api/* calls in
// BOTH dev (Vite proxies /api → here, no rewrite) and prod (this process serves /api directly) — one route
// map, no environment-specific paths.
for (const router of [
    session,
    artifacts,
    folders,
    themes,
    templates,
    billing,
    features,
    media,
    ai,
    links,
])
    app.route("/api", router);

// An unknown /api path is a 404, never the SPA — shields the API namespace from the static fallback below.
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// In production the same process also serves the built SPA (dist/), so the whole app is ONE origin: /api
// stays same-site (cookies + SSE stream direct, no proxy buffering). In dev, Vite serves the SPA with HMR
// and proxies /api here, so this block stays off. root is cwd-relative; `pnpm start` and Render both run
// from the repo root.
if (process.env.NODE_ENV === "production") {
    app.use("/assets/*", serveStatic({ root: "./dist" })); // hashed static assets (host-agnostic)
    app.get("/p/*", serveStatic({ path: "./dist/publish/index.html" })); // public read-only viewer
    app.get("/home", serveStatic({ path: "./dist/index.html" })); // marketing, always (signed-in "view the site")
    // contextual root: the app for a valid session, the marketing site otherwise
    app.get("/", (c, next) => {
        const authed = readSession(getCookie(c, SESSION_COOKIE)) !== null;
        const path = authed ? "./dist/app/index.html" : "./dist/index.html";
        return serveStatic({ path })(c, next);
    });
    // every other route is the app SPA (/edit, /templates, /login, …); its auth gate renders sign-in when needed
    app.get("*", serveStatic({ path: "./dist/app/index.html" }));
}

// Render injects PORT; API_PORT is the local-dev override (8601 default).
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8601);
serve({ fetch: app.fetch, port });
process.stdout.write(`Galleo listening on port ${port}\n`);
