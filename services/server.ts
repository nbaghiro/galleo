import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
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
    app.use("/*", serveStatic({ root: "./dist" })); // real files: /assets/*, favicon, …
    app.get("/app", serveStatic({ path: "./dist/app/index.html" }));
    app.get("/app/*", serveStatic({ path: "./dist/app/index.html" }));
    app.get("/p/*", serveStatic({ path: "./dist/publish/index.html" }));
    app.get("*", serveStatic({ path: "./dist/index.html" })); // marketing site SPA fallback
}

// Render injects PORT; API_PORT is the local-dev override (8601 default).
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8601);
serve({ fetch: app.fetch, port });
process.stdout.write(`Galleo listening on port ${port}\n`);
