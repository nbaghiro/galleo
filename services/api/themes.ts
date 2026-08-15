import { Hono } from "hono";
import type { ThemeInput } from "@themes";
import { readJson, requireFeature } from "@services/utils/http";
import { currentWorkspace } from "@services/core/accounts";
import { createTheme, deleteTheme, listThemes, updateTheme } from "@services/core/themes";
import { requireUser, requireWorkspace, type WorkspaceEnv } from "./middleware";

export const themes = new Hono<WorkspaceEnv>();

// A user with no workspace yet sees an empty shelf, not an error.
themes.get("/themes", requireUser, async (c) => {
    const ws = await currentWorkspace(c.get("user").id);
    return c.json({ themes: ws ? await listThemes(ws.id) : [] });
});

themes.post("/themes", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    const denied = requireFeature(
        c,
        ws,
        "customThemes",
        "Custom themes are a Pro feature — upgrade to create your own.",
    );
    if (denied) return denied;
    const body = await readJson<Partial<ThemeInput>>(c);
    if (!body.tokens) return c.json({ error: "tokens required" }, 400);
    return c.json({ theme: await createTheme(ws.id, body as ThemeInput) });
});

themes.patch("/themes/:id", requireWorkspace, async (c) => {
    const body = await readJson<Partial<ThemeInput>>(c);
    const theme = await updateTheme(c.get("ws").id, c.req.param("id"), body);
    return theme ? c.json({ theme }) : c.json({ error: "not found" }, 404);
});

themes.delete("/themes/:id", requireWorkspace, async (c) => {
    await deleteTheme(c.get("ws").id, c.req.param("id"));
    return c.json({ ok: true });
});
