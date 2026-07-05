import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type { ThemeInput } from "@themes/theme";
import { db, schema } from "../schema";
import { SESSION_COOKIE } from "../auth";
import { currentUser, firstWorkspaceId, readJson } from "./context";

// Per-workspace custom-theme routes (workspaceId null = built-in/system, never returned here): list,
// create, patch, delete.
export const themes = new Hono();

const themeCols = {
    id: schema.themes.id,
    name: schema.themes.name,
    tokens: schema.themes.tokens,
    mood: schema.themes.mood,
    isDark: schema.themes.isDark,
};

themes.get("/themes", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ themes: [] });
    const rows = await db
        .select(themeCols)
        .from(schema.themes)
        .where(eq(schema.themes.workspaceId, ws));
    return c.json({ themes: rows });
});

themes.post("/themes", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const body = await readJson<Partial<ThemeInput>>(c);
    if (!body.tokens) return c.json({ error: "tokens required" }, 400);
    const [t] = await db
        .insert(schema.themes)
        .values({
            workspaceId: ws,
            name: (body.name ?? "Custom theme").trim() || "Custom theme",
            tokens: body.tokens,
            mood: body.mood ?? null,
            isDark: body.isDark ?? false,
        })
        .returning(themeCols);
    return c.json({ theme: t });
});

themes.patch("/themes/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const body = await readJson<Partial<ThemeInput>>(c);
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.tokens !== undefined) patch.tokens = body.tokens;
    if (body.mood !== undefined) patch.mood = body.mood;
    if (body.isDark !== undefined) patch.isDark = body.isDark;
    const [t] = await db
        .update(schema.themes)
        .set(patch)
        .where(and(eq(schema.themes.id, c.req.param("id")), eq(schema.themes.workspaceId, ws)))
        .returning(themeCols);
    if (!t) return c.json({ error: "not found" }, 404);
    return c.json({ theme: t });
});

themes.delete("/themes/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    await db
        .delete(schema.themes)
        .where(and(eq(schema.themes.id, c.req.param("id")), eq(schema.themes.workspaceId, ws)));
    return c.json({ ok: true });
});
