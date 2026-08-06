import { Hono } from "hono";
import type { FolderInput } from "@model/workspace";
import { readJson } from "../utils/http";
import { currentWorkspace } from "../core/accounts";
import { createFolder, deleteFolderTree, listFolders, renameFolder } from "../core/folders";
import { requireUser, requireWorkspace, type WorkspaceEnv } from "./middleware";

export const folders = new Hono<WorkspaceEnv>();

// A user with no workspace yet sees an empty list, not an error.
folders.get("/folders", requireUser, async (c) => {
    const ws = await currentWorkspace(c.get("user").id);
    return c.json({ folders: ws ? await listFolders(ws.id) : [] });
});

folders.post("/folders", requireWorkspace, async (c) => {
    const body = await readJson<Partial<FolderInput>>(c);
    return c.json({ folder: await createFolder(c.get("ws").id, body) });
});

folders.patch("/folders/:id", requireUser, async (c) => {
    const { name } = await readJson<Partial<FolderInput>>(c);
    if (!name || !name.trim()) return c.json({ error: "name required" }, 400);
    const folder = await renameFolder(c.req.param("id"), name);
    return folder ? c.json({ folder }) : c.json({ error: "not found" }, 404);
});

folders.delete("/folders/:id", requireWorkspace, async (c) => {
    await deleteFolderTree(c.get("ws").id, c.req.param("id"));
    return c.json({ ok: true });
});
