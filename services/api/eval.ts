import { Hono } from "hono";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";
import { evalReady, getRun, isEvalAdmin, listRuns, pruneRuns } from "../core/ai/eval/runs";

export const evals = new Hono<WorkspaceEnv>();

// 404 rather than 403 for a non-admin: the playground should not announce itself to users.
const gate = (userId: string): boolean => evalReady() && isEvalAdmin(userId);

evals.get("/eval/runs", requireWorkspace, async (c) => {
    if (!gate(c.get("user").id)) return c.json({ error: "not found" }, 404);
    const before = c.req.query("before");
    const at = before ? new Date(before) : undefined;
    return c.json(
        await listRuns(c.get("ws").id, at && !Number.isNaN(at.getTime()) ? at : undefined),
    );
});

evals.get("/eval/runs/:id", requireWorkspace, async (c) => {
    if (!gate(c.get("user").id)) return c.json({ error: "not found" }, 404);
    const run = await getRun(c.get("ws").id, c.req.param("id"));
    return run ? c.json({ run }) : c.json({ error: "no such run" }, 404);
});

evals.post("/eval/prune", requireWorkspace, async (c) => {
    if (!gate(c.get("user").id)) return c.json({ error: "not found" }, 404);
    await pruneRuns(c.get("ws").id);
    return c.json({ ok: true });
});
