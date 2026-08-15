import { Hono } from "hono";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";
import {
    getRun,
    isEvalAdmin,
    listRuns,
    mergeChecks,
    pruneRuns,
    saveJudgements,
} from "../core/ai/eval/runs";
import { judgeRun } from "../core/ai/eval/judge";
import { RUBRIC } from "../core/ai/eval/rubric";
import { galleo } from "../core/ai/corpus/galleo";
import { helios } from "../core/ai/corpus/helios";
import { aiReady } from "../core/ai/provider";
import type { EvalCheck } from "@model/eval";
import { readJson } from "../utils/http";

export const evals = new Hono<WorkspaceEnv>();

// 404 rather than 403: the playground should not announce itself to users who cannot use it.
const gate = (user: { email: string }): boolean => isEvalAdmin(user);

evals.get("/eval/runs", requireWorkspace, async (c) => {
    if (!gate(c.get("user"))) return c.json({ error: "not found" }, 404);
    const before = c.req.query("before");
    const at = before ? new Date(before) : undefined;
    return c.json(
        await listRuns(c.get("ws").id, at && !Number.isNaN(at.getTime()) ? at : undefined),
    );
});

evals.get("/eval/runs/:id", requireWorkspace, async (c) => {
    if (!gate(c.get("user"))) return c.json({ error: "not found" }, 404);
    const run = await getRun(c.get("ws").id, c.req.param("id"));
    return run ? c.json({ run }) : c.json({ error: "no such run" }, 404);
});

// The app posts layout-derived checks here; they cannot be computed server-side because the layout
// engine lives in canvas, which services may not import.
evals.post("/eval/runs/:id/checks", requireWorkspace, async (c) => {
    if (!gate(c.get("user"))) return c.json({ error: "not found" }, 404);
    const body = await readJson<{ checks?: EvalCheck[] }>(c);
    if (!Array.isArray(body.checks)) return c.json({ error: "checks are required" }, 400);
    const ok = await mergeChecks(c.get("ws").id, c.req.param("id"), body.checks);
    return ok ? c.json({ ok: true }) : c.json({ error: "no such run" }, 404);
});

evals.get("/eval/rubric", requireWorkspace, (c) =>
    gate(c.get("user")) ? c.json({ rubric: RUBRIC }) : c.json({ error: "not found" }, 404),
);

// Judging is explicit, never automatic: it costs tokens and the run is already stored, so it can be
// re-judged later against a newer rubric without regenerating anything.
evals.post("/eval/runs/:id/judge", requireWorkspace, async (c) => {
    if (!gate(c.get("user"))) return c.json({ error: "not found" }, 404);
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const run = await getRun(c.get("ws").id, c.req.param("id"));
    if (!run) return c.json({ error: "no such run" }, 404);
    if (!run.content?.sections.length)
        return c.json({ error: "this run produced nothing to judge" }, 400);
    // the bar is a hand-built piece in the same format, used for calibration only
    const reference = run.content.format === "doc" ? helios : galleo;
    const judgements = await judgeRun(run.content, { reference });
    await saveJudgements(c.get("ws").id, run.id, judgements);
    return c.json({ judgements });
});

evals.post("/eval/prune", requireWorkspace, async (c) => {
    if (!gate(c.get("user"))) return c.json({ error: "not found" }, 404);
    await pruneRuns(c.get("ws").id);
    return c.json({ ok: true });
});
