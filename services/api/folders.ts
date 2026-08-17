import { Hono } from "hono";
import { z } from "zod";
import { BAD_BODY, readJson } from "@services/utils/http";
import { currentWorkspace } from "@services/core/accounts";
import { createFolder, deleteFolderTree, listFolders, renameFolder } from "@services/core/folders";
import { requireUser, requireWorkspace, type WorkspaceEnv } from "./middleware";

export const folders = new Hono<WorkspaceEnv>();

const zFolderInput = z.object({
    name: z.string().optional(),
    parentId: z.string().nullish(),
});

// A user with no workspace yet sees an empty list, not an error.
folders.get("/folders", requireUser, async (c) => {
    const ws = await currentWorkspace(c.get("user").id);
    return c.json({ folders: ws ? await listFolders(ws.id) : [] });
});

folders.post("/folders", requireWorkspace, async (c) => {
    const body = await readJson(c, zFolderInput);
    if (!body) return c.json(BAD_BODY, 400);
    return c.json({ folder: await createFolder(c.get("ws").id, body) });
});

folders.patch("/folders/:id", requireUser, async (c) => {
    const body = await readJson(c, zFolderInput);
    const name = body?.name;
    if (!name || !name.trim()) return c.json({ error: "name required" }, 400);
    const folder = await renameFolder(c.req.param("id"), name);
    return folder ? c.json({ folder }) : c.json({ error: "not found" }, 404);
});

folders.delete("/folders/:id", requireWorkspace, async (c) => {
    await deleteFolderTree(c.get("ws").id, c.req.param("id"));
    return c.json({ ok: true });
});
