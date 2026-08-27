import { Hono } from "hono";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";
import {
    getRun,
    isEvalAdmin,
    listRuns,
    mergeChecks,
    saveJudgements,
} from "@services/core/ai/eval/runs";
import { judgeRun } from "@services/core/ai/eval/judge";
import { judgeVisuals } from "@services/core/ai/eval/visual-judge";
import { RUBRIC } from "@services/core/ai/eval/rubric";
import { galleo } from "@services/core/ai/corpus/galleo";
import { helios } from "@services/core/ai/corpus/helios";
import { aiReady } from "@services/core/ai/provider";
import { z } from "zod";
import { BAD_BODY, readJson } from "@services/utils/http";

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
const zChecks = z.object({
    checks: z
        .array(
            z.object({
                id: z.string(),
                dimension: z.enum(["content", "structure", "variety", "layout"]),
                target: z.string(),
                pass: z.boolean(),
                detail: z.string().optional(),
            }),
        )
        .optional(),
});

const zJudgeVisual = z.object({
    images: z
        .array(z.object({ id: z.string().optional(), dataUrl: z.string().optional() }))
        .optional(),
});

evals.post("/eval/runs/:id/checks", requireWorkspace, async (c) => {
    if (!gate(c.get("user"))) return c.json({ error: "not found" }, 404);
    const body = await readJson(c, zChecks);
    if (!body) return c.json(BAD_BODY, 400);
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

/**
 * The visual verdict. Images come from the client because rendering needs the engine, which services
 * may not import; the same reason `fitChecks` is computed there. Bodies are large, so the cap is on
 * how many sections may be judged rather than on how many may be sent.
 */
evals.post("/eval/runs/:id/judge-visual", requireWorkspace, async (c) => {
    if (!gate(c.get("user"))) return c.json({ error: "not found" }, 404);
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const run = await getRun(c.get("ws").id, c.req.param("id"));
    if (!run) return c.json({ error: "no such run" }, 404);
    const body = await readJson(c, zJudgeVisual);
    if (!body) return c.json(BAD_BODY, 400);
    const images = (body.images ?? []).flatMap((i) => {
        const png = pngFromDataUrl(i.dataUrl);
        return i.id && png ? [{ id: i.id, png }] : [];
    });
    if (!images.length) return c.json({ error: "no rendered sections to judge" }, 400);
    const judgements = await judgeVisuals(images);
    await saveJudgements(c.get("ws").id, run.id, judgements);
    return c.json({ judgements });
});

/** Only PNG, and only base64: anything else is a caller error rather than something to coerce. */
function pngFromDataUrl(url: string | undefined): Uint8Array | null {
    const m = url?.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!m?.[1]) return null;
    try {
        return new Uint8Array(Buffer.from(m[1], "base64"));
    } catch {
        return null;
    }
}
