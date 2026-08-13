import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { readSession, SESSION_COOKIE } from "./utils/auth";
import { assertDatabaseUrl } from "./db/client";
import { out } from "./utils/env";
import { session } from "./api/session";
import { oauth } from "./api/oauth";
import { artifacts } from "./api/artifacts";
import { folders } from "./api/folders";
import { themes } from "./api/themes";
import { templates } from "./api/templates";
import { plan } from "./api/billing";
import { features } from "./api/features";
import { workspace } from "./api/workspace";
import { media } from "./api/media";
import { ai } from "./api/ai";
import { links } from "./api/links";
import { search } from "./api/search";
import { context } from "./api/context";
import { evals } from "./api/eval";

assertDatabaseUrl();

// without a real SESSION_SECRET, sessions sign with the public dev default: anyone could mint a cookie
if (process.env.NODE_ENV === "production") {
    const s = process.env.SESSION_SECRET;
    if (!s || s === "dev-secret-change-me")
        throw new Error("SESSION_SECRET must be set to a strong random value in production");
}

const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
// routers carry their own full paths and mount under /api, so dev (Vite proxies /api here, no
// rewrite) and prod share one route map. Mounted one by one rather than over an array: each router
// declares its own context variables, so an array of them has no single element type.
app.route("/api", session);
app.route("/api", oauth);
app.route("/api", artifacts);
app.route("/api", folders);
app.route("/api", themes);
app.route("/api", templates);
app.route("/api", plan);
app.route("/api", features);
app.route("/api", workspace);
app.route("/api", media);
app.route("/api", ai);
app.route("/api", links);
app.route("/api", search);
app.route("/api", context);
app.route("/api", evals);

// an unknown /api path is a 404, never the SPA fallback below
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// in production this process also serves the built SPA, so /api stays same-origin (cookies + SSE
// direct, no proxy buffering); the static roots are cwd-relative, and both `pnpm start` and Render
// run from the repo root
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
    // every other route is the app SPA; its own auth gate renders sign-in when needed
    app.get("*", serveStatic({ path: "./dist/app/index.html" }));
}

// Render injects PORT; API_PORT is the local-dev override (8601 default).
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8601);
serve({ fetch: app.fetch, port });
out(`Galleo listening on port ${port}`);
