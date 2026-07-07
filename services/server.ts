import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { session } from "./api/session";
import { artifacts } from "./api/artifacts";
import { folders } from "./api/folders";
import { themes } from "./api/themes";
import { templates } from "./api/templates";
import { billing } from "./api/billing";
import { features } from "./api/features";
import { media } from "./api/media";

// The API server: a thin Hono app that mounts each resource router (defined under api/) and listens.
// Every router carries its own full paths, so they all mount at the root.
const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
for (const router of [session, artifacts, folders, themes, templates, billing, features, media])
    app.route("/", router);

const port = Number(process.env.API_PORT ?? 8601);
serve({ fetch: app.fetch, port });
process.stdout.write(`Galleo API listening on http://localhost:${port}\n`);
