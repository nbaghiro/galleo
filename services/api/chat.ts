import { Hono } from "hono";
import { z } from "zod";
import { readJson } from "@services/utils/http";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";
import { clearThread, loadThread, markProposal } from "@services/core/threads";

// The chat thread as the dock reopens it. The turns themselves are appended by the tool route as
// each ask-assistant call ends; this only reads, marks and clears.

export const chat = new Hono<WorkspaceEnv>();

// generation:<id> · artifact:<id> · library, the same key the client derives from its context
const zKey = z.string().regex(/^(generation:[\w-]+|artifact:[\w-]+|library)$/);

const keyOf = (raw: string | undefined): string | null => {
    const parsed = zKey.safeParse(raw ?? "library");
    return parsed.success ? parsed.data : null;
};

chat.get("/chat/thread", requireWorkspace, async (c) => {
    const key = keyOf(c.req.query("key"));
    if (!key) return c.json({ error: "a valid thread key is required" }, 400);
    const thread = await loadThread(c.get("ws").id, c.get("user").id, key);
    return c.json({ thread });
});

const zMark = z.object({
    key: zKey,
    proposal: z.string(),
    mark: z.enum(["applied", "discarded"]),
});

chat.post("/chat/thread/mark", requireWorkspace, async (c) => {
    const body = await readJson(c, zMark);
    if (!body) return c.json({ error: "key, proposal and mark are required" }, 400);
    await markProposal(c.get("ws").id, c.get("user").id, body.key, body.proposal, body.mark);
    return c.json({ ok: true });
});

chat.delete("/chat/thread", requireWorkspace, async (c) => {
    const key = keyOf(c.req.query("key"));
    if (!key) return c.json({ error: "a valid thread key is required" }, 400);
    await clearThread(c.get("ws").id, c.get("user").id, key);
    return c.json({ ok: true });
});
