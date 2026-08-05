import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type { FolderInput } from "@model/workspace";
import { db, schema } from "../schema";
import { SESSION_COOKIE } from "../auth";
import { currentUser, firstWorkspaceId, readJson } from "./context";

export const folders = new Hono();

folders.get("/folders", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ folders: [] });
    const rows = await db
        .select({
            id: schema.folders.id,
            name: schema.folders.name,
            parentId: schema.folders.parentId,
            createdAt: schema.folders.createdAt,
        })
        .from(schema.folders)
        .where(eq(schema.folders.workspaceId, ws))
        .orderBy(schema.folders.createdAt);
    // counted here rather than from the client's artifact list, which is now one page deep
    const counts = await db
        .select({ folderId: schema.artifacts.folderId, count: sql<number>`count(*)::int` })
        .from(schema.artifacts)
        .where(and(eq(schema.artifacts.workspaceId, ws), isNull(schema.artifacts.trashedAt)))
        .groupBy(schema.artifacts.folderId);
    const byFolder = new Map(counts.map((r) => [r.folderId, r.count]));
    return c.json({ folders: rows.map((f) => ({ ...f, count: byFolder.get(f.id) ?? 0 })) });
});

folders.post("/folders", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await firstWorkspaceId(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    const { name, parentId } = await readJson<Partial<FolderInput>>(c);
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

folders.patch("/folders/:id", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { name } = await readJson<Partial<FolderInput>>(c);
    if (!name || !name.trim()) return c.json({ error: "name required" }, 400);
    const [f] = await db
        .update(schema.folders)
        .set({ name: name.trim() })
        .where(eq(schema.folders.id, c.req.param("id")))
        .returning({ id: schema.folders.id, name: schema.folders.name });
    if (!f) return c.json({ error: "not found" }, 404);
    return c.json({ folder: f });
});

folders.delete("/folders/:id", async (c) => {
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
    for (const fid of doomed) {
        await db
            .update(schema.artifacts)
            .set({ folderId: null })
            .where(eq(schema.artifacts.folderId, fid));
        await db.delete(schema.folders).where(eq(schema.folders.id, fid));
    }
    return c.json({ ok: true });
});
