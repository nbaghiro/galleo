import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import type { TurnEvent, TurnRequest, TurnKind, AiActionId, MeterParams } from "@model/ai";
import { estimateCost, isKind } from "@model/ai";
import { limitsFor } from "@model/billing";
import { db, schema } from "../schema";
import { SESSION_COOKIE } from "../auth";
import { currentUser, currentWorkspace, readJson } from "./context";
import { aiReady } from "../ai/provider";
import { runTurn } from "../ai/run";
import { generateThemeFromPrompt } from "../ai/theme";

// The AI route — runs one turn and streams its TurnEvents to the client over SSE. The turn runtime
// (services/ai/run) yields the protocol; this handler adds auth, the credit gate, and SSE framing. The
// client parses each `data:` line back into a LoggedEvent and feeds it to the same dispatch the simulator
// uses, so a turn renders identically whether the events came from a fixture or the model.
export const ai = new Hono();

// Which priced action each turn kind bills as (costs defined in @model/ai AI_ACTIONS).
const ACTION_FOR: Record<TurnKind, AiActionId> = {
    generate: "generate",
    edit: "edit",
    section: "regenerate-section",
    chat: "chat",
};

// The size knobs each kind meters by pre-flight — only generate scales here, by its length chip.
const meterFor = (req: TurnRequest): MeterParams =>
    req.kind === "generate" ? { length: req.input.length } : {};

// The kinds whose runtime is actually built. Others 501 before any charge (runTurn also guards them, but
// blocking here keeps us from reserving credits for a capability that can't run).
const IMPLEMENTED: readonly TurnKind[] = ["generate"];

// POST /ai/turn — run one turn (generate · edit · section · chat). Reserves a size-aware credit estimate,
// then streams turn.start → phase → plan → per-section status/patch/narration → turn.done as SSE frames.
ai.post("/ai/turn", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const req = await readJson<TurnRequest>(c);
    if (!req || !isKind(req.kind)) return c.json({ error: "a valid turn kind is required" }, 400);
    if (!IMPLEMENTED.includes(req.kind))
        return c.json({ error: `${req.kind} turns aren’t available yet` }, 501);
    if (req.kind === "generate" && !req.input?.prompt?.trim())
        return c.json({ error: "a prompt is required" }, 400);

    // Credit gate — reserve a size-aware estimate before the billable model calls. 402 when spent.
    const cost = estimateCost(ACTION_FOR[req.kind], meterFor(req));
    const limit = limitsFor(ws.plan).aiCreditsPerMonth;
    if (ws.aiCreditsUsed + cost > limit)
        return c.json(
            {
                error: "out of AI credits",
                upgrade: true,
                remaining: Math.max(0, limit - ws.aiCreditsUsed),
            },
            402,
        );
    await db
        .update(schema.workspaces)
        .set({ aiCreditsUsed: ws.aiCreditsUsed + cost })
        .where(eq(schema.workspaces.id, ws.id));

    const ctrl = new AbortController();
    return streamSSE(c, async (stream) => {
        stream.onAbort(() => ctrl.abort()); // client navigated away / canceled → stop the run
        let seq = 0;
        const send = (event: TurnEvent): Promise<void> =>
            stream.writeSSE({ data: JSON.stringify({ seq: seq++, event }) });
        try {
            for await (const ev of runTurn(req, { signal: ctrl.signal })) await send(ev);
        } catch (e) {
            if (!ctrl.signal.aborted)
                await send({
                    type: "error",
                    message: e instanceof Error ? e.message : "the turn failed",
                });
        }
    });
});

// POST /ai/theme — generate one custom theme from a text prompt. Not a streamed turn: a single small
// structured call returns a full ThemeInput (name + mood + isDark + tokens) to preview/save. Reserves the
// metered generate-theme cost up front, same gate as a turn.
ai.post("/ai/theme", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson<{ prompt?: string; isDark?: boolean }>(c);
    if (!body?.prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);

    const cost = estimateCost("generate-theme");
    const limit = limitsFor(ws.plan).aiCreditsPerMonth;
    if (ws.aiCreditsUsed + cost > limit)
        return c.json(
            {
                error: "out of AI credits",
                upgrade: true,
                remaining: Math.max(0, limit - ws.aiCreditsUsed),
            },
            402,
        );
    await db
        .update(schema.workspaces)
        .set({ aiCreditsUsed: ws.aiCreditsUsed + cost })
        .where(eq(schema.workspaces.id, ws.id));

    try {
        const theme = await generateThemeFromPrompt(body.prompt.trim(), { isDark: body.isDark });
        return c.json({ theme });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "theme generation failed" }, 500);
    }
});
