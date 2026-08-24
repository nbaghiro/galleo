import "dotenv/config";
import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { readSession, SESSION_COOKIE } from "./utils/auth";
import { assertDatabaseUrl } from "./db/client";
import { checkMailConfig } from "./core/mail";
import { checkAuthConfig } from "./core/accounts";
import { out } from "./utils/env";
import { initAnalytics, shutdownAnalytics, withRequestId } from "./utils/analytics";
import { asRequestId, REQUEST_ID_HEADER } from "@model/analytics";
import { session } from "./api/session";
import { account } from "./api/account";
import { oauth } from "./api/oauth";
import { artifacts } from "./api/artifacts";
import { comments } from "./api/comments";
import { collaborators } from "./api/collaborators";
import { collabRouter } from "./api/collab";
import { folders } from "./api/folders";
import { themes } from "./api/themes";
import { templates } from "./api/templates";
import { plan } from "./api/billing";
import { features } from "./api/features";
import { workspace } from "./api/workspace";
import { media } from "./api/media";
import { ai } from "./api/ai";
import { links } from "./api/links";
import { narration } from "./api/narration";
import { voices } from "./api/voices";
import { search } from "./api/search";
import { context } from "./api/context";
import { evals } from "./api/eval";
import { onboarding } from "./api/onboarding";
import { ingest } from "./api/ingest";

assertDatabaseUrl();
initAnalytics();

// without a real SESSION_SECRET, sessions sign with the public dev default: anyone could mint a cookie
if (process.env.NODE_ENV === "production") {
    const s = process.env.SESSION_SECRET;
    if (!s || s === "dev-secret-change-me")
        throw new Error("SESSION_SECRET must be set to a strong random value in production");
}

const app = new Hono();
// The live-collaboration socket runs in this process, on this app: rooms are in-memory, so a second
// instance would not share them. Fanning out across instances is the Redis step (port 8603).
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
// Before every route: one id per request, minted by the browser or here, in scope for whatever the
// request goes on to do. Echoed back so a failure a user reports can be found in the data.
app.use("*", (c, next) => {
    const id = asRequestId(c.req.header(REQUEST_ID_HEADER), () => randomUUID());
    c.header(REQUEST_ID_HEADER, id);
    return withRequestId(id, next);
});

app.get("/health", (c) => c.json({ ok: true }));
// routers carry their own full paths and mount under /api, so dev (Vite proxies /api here, no
// rewrite) and prod share one route map. Mounted one by one rather than over an array: each router
// declares its own context variables, so an array of them has no single element type.
app.route("/api", session);
app.route("/api", account);
app.route("/api", oauth);
app.route("/api", artifacts);
app.route("/api", comments);
app.route("/api", collaborators);
app.route("/api", collabRouter(upgradeWebSocket));
app.route("/api", folders);
app.route("/api", themes);
app.route("/api", templates);
app.route("/api", plan);
app.route("/api", features);
app.route("/api", workspace);
app.route("/api", media);
app.route("/api", ai);
app.route("/api", links);
app.route("/api", narration);
app.route("/api", voices);
app.route("/api", search);
app.route("/api", context);
app.route("/api", evals);
app.route("/api", onboarding);
app.route("/api", ingest);

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
const server = serve({ fetch: app.fetch, port });
injectWebSocket(server); // handles the upgrade on the same listener the API uses

// Render sends SIGTERM on every deploy, so drain the analytics queue rather than dropping it.
const drain = (): void => {
    void shutdownAnalytics().then(() => process.exit(0));
};
process.on("SIGTERM", drain);
process.on("SIGINT", drain);
checkMailConfig();
checkAuthConfig();
out(`Galleo listening on port ${port}`);
