import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import type { TurnEvent, TurnRequest, TurnKind } from "@model/ai";
import { isKind } from "@model/ai";
import type { ToolId, MeterParams } from "@model/tools";
import { estimateCost, estimateUsage } from "@model/tools";
import type { Usage } from "@model/credits";
import { costOf, mergeUsage } from "@model/credits";
import { limitsFor } from "@model/billing";
import { db, schema } from "../schema";
import { SESSION_COOKIE } from "../auth";
import { currentUser, currentWorkspace, readJson } from "./context";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { aiReady } from "../ai/provider";
import { reviseElement, runTurn } from "../ai/run";
import type { ImageOptions } from "../ai/run";
import { generateImage, imageGenReady } from "../media/generate";
import { makeWorkspaceReader } from "./workspace-reader";
import { rewriteText, translateText } from "../ai/text";
import { suggestSections } from "../ai/suggest";
import { generateThemeFromPrompt } from "../ai/theme";

// The AI route — runs one turn and streams its TurnEvents to the client over SSE. The turn runtime
// (services/ai/run) yields the protocol; this handler adds auth, the credit gate, and SSE framing. The
// client parses each `data:` line back into a LoggedEvent and feeds it to the same dispatch the simulator
// uses, so a turn renders identically whether the events came from a fixture or the model.
export const ai = new Hono();

// Which priced tool each turn kind bills as (costs defined on the tool def in @model/tools).
const ACTION_FOR: Record<TurnKind, ToolId> = {
    generate: "generate-artifact",
    edit: "revise-artifact",
    section: "add-section",
    chat: "ask-assistant",
};

// The size knobs each kind meters by pre-flight — only generate scales here, by its length chip and whether
// its images are AI-generated (stock images are free; AI images are metered per image, reconciled after).
const meterFor = (req: TurnRequest): MeterParams =>
    req.kind === "generate" ? { length: req.input.length, imageSource: req.input.imageSource } : {};

// The kinds whose runtime is actually built. Others 501 before any charge (runTurn also guards them, but
// blocking here keeps us from reserving credits for a capability that can't run).
const IMPLEMENTED: readonly TurnKind[] = ["generate", "section", "chat"];

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
    if (req.kind === "section" && (!req.input?.instruction?.trim() || !req.input?.content))
        return c.json({ error: "an instruction and the current artifact are required" }, 400);
    if (req.kind === "chat" && !req.input?.message?.trim())
        return c.json({ error: "a message is required" }, 400);

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

    // A chat turn is agentic: the flat `ask-assistant` reserve covers the reply, but the content sub-tools it
    // may chain (add / rewrite / edit-section) each run a real model call. They report their usage as they go
    // (RunOpts.onUsage); after the turn we bill that on top of the reserve, so "add two sections and rewrite
    // the intro" charges for the three generations it actually did, not one flat reply. Non-chat kinds never
    // call onUsage, so `extra` stays empty and the reserve is the whole charge.
    let extra: Usage = {};
    const onUsage = (u: Usage): void => {
        extra = mergeUsage(extra, u);
    };

    // Images: stock by default (instant, free). When a generate brief asks for AI images and the key is set,
    // inject a generator that renders each art-director phrase with the image model, stores it as a workspace
    // asset, and COUNTS it — the reserve priced only an estimate of images, so after the turn we reconcile the
    // generate cost to the real number produced (falling back to stock, unbilled, on any miss).
    const wantsAiImages =
        req.kind === "generate" && req.input.imageSource === "ai" && imageGenReady();
    let aiImages = 0;
    const image: ImageOptions = wantsAiImages
        ? {
              source: "ai",
              generate: async (phrase, orientation) => {
                  const aspect =
                      orientation === "portrait"
                          ? "3:4"
                          : orientation === "square"
                            ? "1:1"
                            : "16:9";
                  const img = await generateImage(phrase, aspect);
                  if (!img) return null;
                  const id = crypto.randomUUID();
                  await db.insert(schema.assets).values({
                      id,
                      workspaceId: ws.id,
                      kind: "image",
                      source: "generated",
                      url: `/api/media/asset/${id}`,
                      width: img.width,
                      height: img.height,
                      bytes: Buffer.from(img.dataBase64, "base64").length,
                      alt: phrase.slice(0, 160),
                      meta: { prompt: phrase },
                      data: img.dataBase64,
                      mime: img.mime,
                  });
                  aiImages++;
                  return `/api/media/asset/${id}`;
              },
          }
        : {};

    const ctrl = new AbortController();
    return streamSSE(c, async (stream) => {
        stream.onAbort(() => ctrl.abort()); // client navigated away / canceled → stop the run
        let seq = 0;
        const send = (event: TurnEvent): Promise<void> =>
            stream.writeSSE({ data: JSON.stringify({ seq: seq++, event }) });
        try {
            const workspace = makeWorkspaceReader(ws.id);
            for await (const ev of runTurn(req, { signal: ctrl.signal, workspace, onUsage, image }))
                await send(ev);
        } catch (e) {
            if (!ctrl.signal.aborted)
                await send({
                    type: "error",
                    message: e instanceof Error ? e.message : "the turn failed",
                });
        } finally {
            // Reconcile the reserve to what actually ran. Chat: the content sub-tools it chained, billed on top
            // of the flat reply reserve. Generate with AI images: re-price the whole turn with the REAL number
            // of images produced (the reserve used an estimate), so AI images cost their true amount while a
            // failed one that fell back to stock costs nothing. Runs even on a mid-turn error, so the model
            // spend that already happened is still billed.
            let owed = cost;
            if (Object.keys(extra).length) owed += costOf(extra);
            if (wantsAiImages)
                owed = costOf({
                    ...estimateUsage("generate-artifact", meterFor(req)),
                    image: aiImages,
                });
            if (owed !== cost)
                await db
                    .update(schema.workspaces)
                    .set({ aiCreditsUsed: ws.aiCreditsUsed + owed })
                    .where(eq(schema.workspaces.id, ws.id));
        }
    });
});

// POST /ai/suggest — cheap "what to add next" ideas for an existing artifact (the insert-a-section popup).
// Auth-gated but UNMETERED: a single tiny Flash call, and the client caches the result per artifact, so it
// runs at most once per artifact on demand. Returns { suggestions: string[] } — empty on any failure, since
// the client always has its free deterministic set to fall back to.
ai.post("/ai/suggest", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    if (!aiReady()) return c.json({ suggestions: [] });
    const body = await readJson<{ content?: ArtifactContent }>(c);
    if (!body?.content?.sections?.length) return c.json({ suggestions: [] });
    try {
        return c.json({ suggestions: await suggestSections(body.content) });
    } catch {
        return c.json({ suggestions: [] });
    }
});

// POST /ai/element — regenerate ONE element in place. Not a streamed turn: a single call returns the fresh
// element for the editor to swap in (undoable client-side). The element rides along in the body (the runtime
// can't traverse the canvas tree), with the section it lives in for context. Reserves the metered
// edit-element cost up front, same gate as a turn; 402 when spent, 500 on a generation failure.
ai.post("/ai/element", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson<{
        content?: ArtifactContent;
        sectionId?: string;
        element?: ElementInstance;
        instruction?: string;
    }>(c);
    if (!body?.content?.sections?.length || !body.sectionId || !body.element?.type)
        return c.json({ error: "content, sectionId, and element are required" }, 400);

    const cost = estimateCost("revise-element");
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
        const element = await reviseElement(
            body.content,
            body.sectionId,
            body.element,
            body.instruction,
        );
        return c.json({ element });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "regeneration failed" }, 500);
    }
});

// POST /ai/text — rewrite or translate ONE selected passage. Not a streamed turn: a single fast call returns
// the edited text for the editor to splice back into the selection. Meters as the matching text action
// (rewrite / translate). 402 when out of credits, 500 on a generation failure.
ai.post("/ai/text", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson<{
        op?: "rewrite" | "translate";
        text?: string;
        instruction?: string;
        language?: string;
        context?: string;
    }>(c);
    if (!body?.text?.trim() || (body.op !== "rewrite" && body.op !== "translate"))
        return c.json({ error: "op ('rewrite' | 'translate') and text are required" }, 400);
    if (body.op === "rewrite" && !body.instruction?.trim())
        return c.json({ error: "an instruction is required" }, 400);
    if (body.op === "translate" && !body.language?.trim())
        return c.json({ error: "a target language is required" }, 400);

    const cost = estimateCost(body.op === "translate" ? "translate-text" : "rewrite-text");
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
        const text =
            body.op === "translate"
                ? await translateText(body.text, body.language!.trim(), { context: body.context })
                : await rewriteText(body.text, body.instruction!.trim(), { context: body.context });
        return c.json({ text });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "the edit failed" }, 500);
    }
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
