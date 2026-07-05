import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { TEMPLATES } from "../templates";
import { SESSION_COOKIE } from "../auth";
import { currentUser } from "./context";

// Starter-templates route (global, static) — the app's Templates page reads this to offer "new from
// template"; grouped by category client-side.
export const templates = new Hono();

templates.get("/templates", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    return c.json({
        templates: TEMPLATES.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            description: t.description,
            content: t.artifact,
        })),
    });
});
