import "dotenv/config";
import { serve } from "@hono/node-server";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db, schema } from "../data/client";
import { makeSession, readSession, SESSION_COOKIE } from "../auth/session";

const app = new Hono();

const DEMO_EMAIL = "demo@galleo.app";

interface SessionUser {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
}

async function currentUser(token: string | undefined): Promise<SessionUser | null> {
    const uid = readSession(token);
    if (!uid) return null;
    const [u] = await db
        .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, avatarUrl: schema.users.avatarUrl })
        .from(schema.users)
        .where(eq(schema.users.id, uid));
    return u ?? null;
}

app.get("/health", (c) => c.json({ ok: true }));

// --- auth ---
app.post("/auth/demo", async (c) => {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_EMAIL));
    if (!u) return c.json({ error: "demo user not seeded — run `pnpm seed`" }, 400);
    setCookie(c, SESSION_COOKIE, makeSession(u.id), { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return c.json({ user: { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl } });
});

app.post("/auth/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
});

app.get("/me", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    return c.json({ user: u });
});

// --- artifacts ---
async function firstWorkspaceId(userId: string): Promise<string | null> {
    const ms = await db.select({ ws: schema.members.workspaceId }).from(schema.members).where(eq(schema.members.userId, userId));
    return ms[0]?.ws ?? null;
}

app.get("/artifacts", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ artifacts: [] });
    const rows = await db
        .select({ id: schema.artifacts.id, title: schema.artifacts.title, themeId: schema.artifacts.themeId, formatId: schema.artifacts.formatId, updatedAt: schema.artifacts.updatedAt })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.workspaceId, ws))
        .orderBy(desc(schema.artifacts.updatedAt));
    return c.json({ artifacts: rows });
});

app.get("/artifacts/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const [a] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, c.req.param("id")));
    if (!a) return c.json({ error: "not found" }, 404);
    return c.json({ artifact: { id: a.id, title: a.title, themeId: a.themeId, formatId: a.formatId, draftContent: a.draftContent, updatedAt: a.updatedAt } });
});

interface ArtifactPatch {
    title?: string;
    themeId?: string;
    formatId?: string;
    draftContent?: unknown;
}

app.patch("/artifacts/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as ArtifactPatch;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) patch.title = body.title;
    if (body.themeId !== undefined) patch.themeId = body.themeId;
    if (body.formatId !== undefined) patch.formatId = body.formatId;
    if (body.draftContent !== undefined) patch.draftContent = body.draftContent;
    const [a] = await db
        .update(schema.artifacts)
        .set(patch)
        .where(eq(schema.artifacts.id, c.req.param("id")))
        .returning({ id: schema.artifacts.id, updatedAt: schema.artifacts.updatedAt });
    if (!a) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, updatedAt: a.updatedAt });
});

const port = Number(process.env.API_PORT ?? 8601);
serve({ fetch: app.fetch, port });
process.stdout.write(`Galleo API listening on http://localhost:${port}\n`);
