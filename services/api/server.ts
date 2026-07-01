import "dotenv/config";
import { serve } from "@hono/node-server";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db, schema } from "../data/client";
import { verifyPassword } from "../auth/password";
import { makeSession, readSession, SESSION_COOKIE } from "../auth/session";
import { TEMPLATES } from "./templates";

const app = new Hono();

// Parse a JSON request body, defaulting to `{}` on missing/malformed input (so field checks just see
// undefined). The generic is the caller's declared body shape.
async function readJson<T>(c: Context): Promise<T> {
    return (await c.req.json().catch(() => ({}))) as T;
}

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
        .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            avatarUrl: schema.users.avatarUrl,
        })
        .from(schema.users)
        .where(eq(schema.users.id, uid));
    return u ?? null;
}

app.get("/health", (c) => c.json({ ok: true }));

// --- auth ---
interface LoginBody {
    email?: string;
    password?: string;
}

app.post("/auth/login", async (c) => {
    const { email, password } = await readJson<LoginBody>(c);
    if (!email || !password) return c.json({ error: "email and password are required" }, 400);
    const [u] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email.trim().toLowerCase()));
    if (!u || !verifyPassword(password, u.passwordHash))
        return c.json({ error: "invalid email or password" }, 401);
    setCookie(c, SESSION_COOKIE, makeSession(u.id), {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
    });
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
    const ms = await db
        .select({ ws: schema.members.workspaceId })
        .from(schema.members)
        .where(eq(schema.members.userId, userId));
    return ms[0]?.ws ?? null;
}

// A tiny cover snippet (eyebrow · title · sub) pulled from the first section, so the library can
// render a faithful preview without shipping the whole document.
interface RawEl {
    type?: string;
    data?: { style?: string; text?: string; src?: string; children?: RawEl[] };
}
interface RawDraft {
    background?: { image?: string };
    sections?: { background?: { image?: string }; cells?: Record<string, { element?: RawEl }> }[];
}

// Depth-first visit of a raw draft element + its nested group children.
const walkRaw = (el: RawEl | undefined, visit: (el: RawEl) => void): void => {
    if (!el) return;
    visit(el);
    for (const ch of el.data?.children ?? []) walkRaw(ch, visit);
};

function coverOf(draft: unknown): {
    eyebrow?: string;
    title?: string;
    sub?: string;
    image?: string;
} {
    const d = draft as RawDraft;
    const sec = d.sections?.[0];
    if (!sec) return {};
    const texts: { style?: string; text?: string }[] = [];
    let image = d.background?.image ?? sec.background?.image;
    for (const cell of Object.values(sec.cells ?? {}))
        walkRaw(cell.element, (el) => {
            if (el.type === "text" && el.data)
                texts.push({ style: el.data.style, text: el.data.text });
            if (el.type === "image" && !image && el.data?.src) image = el.data.src;
        });
    const find = (...styles: string[]): string | undefined =>
        texts.find((t) => t.style && styles.includes(t.style))?.text;
    return {
        eyebrow: find("eyebrow"),
        title: find("display", "h2", "title", "stat"),
        sub: find("lead", "body", "byline"),
        image,
    };
}

// A per-section summary for the library "filmstrip" — a short label + a coarse kind for each section,
// so a layout can preview/navigate the document's structure without shipping the whole thing.
function sectionsSummary(draft: unknown): { title?: string; kind: string }[] {
    const d = draft as RawDraft;
    return (d.sections ?? []).map((sec, idx) => {
        let title: string | undefined;
        let firstStyle: string | undefined;
        const kinds = new Set<string>();
        for (const cell of Object.values(sec.cells ?? {}))
            walkRaw(cell.element, (el) => {
                if (el.type === "text" && el.data) {
                    const st = el.data.style;
                    if (
                        el.data.text &&
                        !title &&
                        st &&
                        !["eyebrow", "caption", "byline"].includes(st)
                    )
                        title = el.data.text;
                    if (!firstStyle && st) firstStyle = st;
                }
                if (el.type && !["text", "group", "card", "cell"].includes(el.type))
                    kinds.add(el.type);
            });
        let kind = "cover";
        if (idx > 0) {
            kind = "content";
            if (kinds.has("chart")) kind = "chart";
            else if (kinds.has("table")) kind = "table";
            else if (kinds.has("diagram")) kind = "diagram";
            else if (
                kinds.has("image") ||
                kinds.has("video") ||
                kinds.has("embed") ||
                sec.background?.image
            )
                kind = "media";
            else if (firstStyle === "stat") kind = "stat";
            else if (firstStyle === "quote") kind = "quote";
        }
        return { title: title?.slice(0, 64), kind };
    });
}

app.get("/artifacts", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ artifacts: [] });
    const trashed = c.req.query("trashed") === "1"; // ?trashed=1 → the Trash list, else live artifacts
    const rows = await db
        .select({
            id: schema.artifacts.id,
            title: schema.artifacts.title,
            themeId: schema.artifacts.themeId,
            formatId: schema.artifacts.formatId,
            folderId: schema.artifacts.folderId,
            updatedAt: schema.artifacts.updatedAt,
            trashedAt: schema.artifacts.trashedAt,
            draftContent: schema.artifacts.draftContent,
        })
        .from(schema.artifacts)
        .where(
            and(
                eq(schema.artifacts.workspaceId, ws),
                trashed
                    ? isNotNull(schema.artifacts.trashedAt)
                    : isNull(schema.artifacts.trashedAt),
            ),
        )
        .orderBy(desc(trashed ? schema.artifacts.trashedAt : schema.artifacts.updatedAt));
    const artifacts = rows.map(({ draftContent, ...meta }) => ({
        ...meta,
        cover: coverOf(draftContent),
        sections: sectionsSummary(draftContent),
    }));
    return c.json({ artifacts });
});

// --- folders ---
app.get("/folders", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ folders: [] });
    const folders = await db
        .select({
            id: schema.folders.id,
            name: schema.folders.name,
            parentId: schema.folders.parentId,
            createdAt: schema.folders.createdAt,
        })
        .from(schema.folders)
        .where(eq(schema.folders.workspaceId, ws))
        .orderBy(schema.folders.createdAt);
    return c.json({ folders });
});

app.post("/folders", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const { name, parentId } = await readJson<{ name?: string; parentId?: string | null }>(c);
    const [f] = await db
        .insert(schema.folders)
        .values({
            workspaceId: ws,
            name: (name ?? "New folder").trim() || "New folder",
            parentId: parentId ?? null,
        })
        .returning({
            id: schema.folders.id,
            name: schema.folders.name,
            parentId: schema.folders.parentId,
            createdAt: schema.folders.createdAt,
        });
    return c.json({ folder: f });
});

app.patch("/folders/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { name } = await readJson<{ name?: string }>(c);
    if (!name || !name.trim()) return c.json({ error: "name required" }, 400);
    const [f] = await db
        .update(schema.folders)
        .set({ name: name.trim() })
        .where(eq(schema.folders.id, c.req.param("id")))
        .returning({ id: schema.folders.id, name: schema.folders.name });
    if (!f) return c.json({ error: "not found" }, 404);
    return c.json({ folder: f });
});

app.delete("/folders/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const id = c.req.param("id");
    // collect this folder + all descendant subfolders
    const all = await db
        .select({ id: schema.folders.id, parentId: schema.folders.parentId })
        .from(schema.folders)
        .where(eq(schema.folders.workspaceId, ws));
    const doomed = new Set([id]);
    for (let changed = true; changed; ) {
        changed = false;
        for (const f of all) {
            if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
                doomed.add(f.id);
                changed = true;
            }
        }
    }
    // move their artifacts back to "no folder", then remove the folders
    for (const fid of doomed) {
        await db
            .update(schema.artifacts)
            .set({ folderId: null })
            .where(eq(schema.artifacts.folderId, fid));
        await db.delete(schema.folders).where(eq(schema.folders.id, fid));
    }
    return c.json({ ok: true });
});

// --- themes (per-workspace custom themes; workspaceId null = built-in/system, never returned here) ---
interface ThemeBody {
    name?: string;
    tokens?: unknown;
    mood?: string | null;
    isDark?: boolean;
}
const themeCols = {
    id: schema.themes.id,
    name: schema.themes.name,
    tokens: schema.themes.tokens,
    mood: schema.themes.mood,
    isDark: schema.themes.isDark,
};

app.get("/themes", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ themes: [] });
    const themes = await db
        .select(themeCols)
        .from(schema.themes)
        .where(eq(schema.themes.workspaceId, ws));
    return c.json({ themes });
});

app.post("/themes", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const body = await readJson<ThemeBody>(c);
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

app.patch("/themes/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const body = await readJson<ThemeBody>(c);
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

app.delete("/themes/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    await db
        .delete(schema.themes)
        .where(and(eq(schema.themes.id, c.req.param("id")), eq(schema.themes.workspaceId, ws)));
    return c.json({ ok: true });
});

// Starter templates (global, static) — grouped by category in the app's Templates page.
app.get("/templates", async (c) => {
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

interface CreateBody {
    title?: string;
    formatId?: string;
    themeId?: string;
    draftContent?: unknown;
    folderId?: string | null;
}

app.post("/artifacts", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const body = await readJson<CreateBody>(c);
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId: ws,
            title: body.title ?? "Untitled",
            formatId: body.formatId ?? "deck",
            themeId: body.themeId ?? "studio",
            draftContent: body.draftContent ?? {},
            folderId: body.folderId ?? null,
            createdBy: u.id,
        })
        .returning({ id: schema.artifacts.id });
    if (!a) return c.json({ error: "create failed" }, 500);
    return c.json({ id: a.id });
});

app.get("/artifacts/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const [a] = await db
        .select()
        .from(schema.artifacts)
        .where(eq(schema.artifacts.id, c.req.param("id")));
    if (!a) return c.json({ error: "not found" }, 404);
    return c.json({
        artifact: {
            id: a.id,
            title: a.title,
            themeId: a.themeId,
            formatId: a.formatId,
            draftContent: a.draftContent,
            updatedAt: a.updatedAt,
        },
    });
});

// soft delete → moves to Trash (recoverable)
app.post("/artifacts/:id/trash", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    await db
        .update(schema.artifacts)
        .set({ trashedAt: new Date() })
        .where(
            and(eq(schema.artifacts.id, c.req.param("id")), eq(schema.artifacts.workspaceId, ws)),
        );
    return c.json({ ok: true });
});

// restore from Trash
app.post("/artifacts/:id/restore", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    await db
        .update(schema.artifacts)
        .set({ trashedAt: null })
        .where(
            and(eq(schema.artifacts.id, c.req.param("id")), eq(schema.artifacts.workspaceId, ws)),
        );
    return c.json({ ok: true });
});

// permanent delete (one item — used from Trash)
app.delete("/artifacts/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    await db
        .delete(schema.artifacts)
        .where(
            and(eq(schema.artifacts.id, c.req.param("id")), eq(schema.artifacts.workspaceId, ws)),
        );
    return c.json({ ok: true });
});

// empty Trash — permanently delete every trashed artifact in the workspace
app.delete("/trash", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    await db
        .delete(schema.artifacts)
        .where(and(eq(schema.artifacts.workspaceId, ws), isNotNull(schema.artifacts.trashedAt)));
    return c.json({ ok: true });
});

interface ArtifactPatch {
    title?: string;
    themeId?: string;
    formatId?: string;
    draftContent?: unknown;
    folderId?: string | null;
}

app.patch("/artifacts/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const body = await readJson<ArtifactPatch>(c);
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.themeId !== undefined) patch.themeId = body.themeId;
    if (body.formatId !== undefined) patch.formatId = body.formatId;
    if (body.draftContent !== undefined) patch.draftContent = body.draftContent;
    if (body.folderId !== undefined) patch.folderId = body.folderId;
    // a folder-only move shouldn't reorder the library; bump updatedAt only for real edits
    if (
        body.title !== undefined ||
        body.themeId !== undefined ||
        body.formatId !== undefined ||
        body.draftContent !== undefined
    ) {
        patch.updatedAt = new Date();
    }
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
