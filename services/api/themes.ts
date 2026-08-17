import { Hono } from "hono";
import { z } from "zod";
import { BAD_BODY, readJson, requireFeature } from "@services/utils/http";
import { currentWorkspace } from "@services/core/accounts";
import { createTheme, deleteTheme, listThemes, updateTheme } from "@services/core/themes";
import { requireUser, requireWorkspace, type WorkspaceEnv } from "./middleware";

export const themes = new Hono<WorkspaceEnv>();

// loose so a token added to the contract still round-trips through an older server rather than
// being stripped out of the theme on the way to the row
const zTokens = z.looseObject({
    bg: z.string(),
    surface: z.string(),
    ink: z.string(),
    soft: z.string(),
    muted: z.string(),
    accent: z.string(),
    onAccent: z.string(),
    line: z.string(),
    radius: z.number(),
    fontDisplay: z.string(),
    fontBody: z.string(),
    fontMono: z.string(),
    headingWeight: z.number(),
    border: z.number().optional(),
    shadow: z.string().optional(),
    scrim: z.number().optional(),
});

// Only tokens are required on the wire: createTheme() fills the name, mood and dark flag, so a
// caller sending just a palette is a valid create rather than a malformed body.
const zThemeInput = z.object({
    name: z.string().optional(),
    tokens: zTokens.optional(),
    mood: z.string().nullish(),
    isDark: z.boolean().optional(),
});

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
        "Custom themes are a Pro feature. Upgrade to create your own.",
    );
    if (denied) return denied;
    const body = await readJson(c, zThemeInput);
    if (!body) return c.json(BAD_BODY, 400);
    if (!body.tokens) return c.json({ error: "tokens required" }, 400);
    return c.json({ theme: await createTheme(ws.id, { ...body, tokens: body.tokens }) });
});

themes.patch("/themes/:id", requireWorkspace, async (c) => {
    const body = await readJson(c, zThemeInput);
    if (!body) return c.json(BAD_BODY, 400);
    const theme = await updateTheme(c.get("ws").id, c.req.param("id"), body);
    return theme ? c.json({ theme }) : c.json({ error: "not found" }, 404);
});

themes.delete("/themes/:id", requireWorkspace, async (c) => {
    await deleteTheme(c.get("ws").id, c.req.param("id"));
    return c.json({ ok: true });
});
