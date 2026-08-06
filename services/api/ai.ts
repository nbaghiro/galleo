import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getCookie } from "hono/cookie";
import type { Surface, TurnEvent, TurnRequest } from "@model/ai";
import { isKind } from "@model/ai";
import { overridesFrom, requireWorkspace, type WorkspaceEnv } from "./middleware";
import { costOf, creditsForUsd, estimateCost } from "@model/credits";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { featuresFor } from "@model/billing";
import { currentUser } from "../core/accounts";
import { SESSION_COOKIE } from "../utils/auth";
import { readJson } from "../utils/http";
import { warn } from "../utils/env";
import { chargeCredits, settleCredits } from "../core/credits";
import { generateImage, imageGenReady, storeGenerated } from "../core/media";
import { ACTION_FOR, IMPLEMENTED, meterFor, ratesFor, usdOf, withMeter } from "../core/ai/meter";
import { aiReady } from "../core/ai/provider";
import { reviseElement, runTurn } from "../core/ai/run";
import type { ImageOptions } from "../core/ai/run";
import { makeWorkspaceReader } from "../core/ai/reader";
import {
    expandBrief,
    generateThemeFromPrompt,
    rewriteText,
    suggestSections,
    translateText,
} from "../core/ai/tasks";
import type { BriefRead } from "../core/ai/prompts/brief";

export const ai = new Hono<WorkspaceEnv>();

ai.post("/ai/turn", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const req = await readJson<TurnRequest>(c);
    if (!req || !isKind(req.kind)) return c.json({ error: "a valid turn kind is required" }, 400);
    if (!IMPLEMENTED.includes(req.kind))
        return c.json({ error: `${req.kind} turns aren’t available yet` }, 501);
    if ((req.kind === "generate" || req.kind === "plan") && !req.input?.prompt?.trim())
        return c.json({ error: "a prompt is required" }, 400);
    if (req.kind === "section" && (!req.input?.instruction?.trim() || !req.input?.content))
        return c.json({ error: "an instruction and the current artifact are required" }, 400);
    if (req.kind === "chat" && !req.input?.message?.trim())
        return c.json({ error: "a message is required" }, 400);
    if (
        req.kind === "build" &&
        (!req.input?.brief?.prompt?.trim() ||
            !req.input?.beat?.id ||
            !req.input?.outline?.beats?.length ||
            !req.input?.content)
    )
        return c.json(
            { error: "a brief, outline, beat, and the artifact so far are required" },
            400,
        );

    // Reserve before the billable model calls; 402 when spent.
    const feats = featuresFor(ws);
    const meter = meterFor(req, feats.maxSectionsPerGeneration);
    // a step pinned to a heavier model costs us more, so the reserve and the settle both price the
    // models this turn will actually run on
    const overrides = overridesFrom(c);
    const rates = ratesFor(ws, overridesFrom(c));
    const cost = estimateCost(ACTION_FOR[req.kind], meter, rates);
    const spend = await chargeCredits(ws, cost, ACTION_FOR[req.kind]);
    if (!spend.ok)
        return c.json(
            { error: "out of AI credits", upgrade: true, remaining: spend.remaining },
            402,
        );

    // AI images are counted so the settle can reconcile the estimate to the real count; stock is free.
    const imageSource =
        req.kind === "generate"
            ? req.input.imageSource
            : req.kind === "build"
              ? req.input.brief.imageSource
              : req.kind === "chat"
                ? req.input.context.imageSource // so a re-sourced image matches the rest of the piece
                : undefined;
    const wantsAiImages = imageSource === "ai" && imageGenReady();
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
                  const img = await generateImage(phrase, aspect, "photo", feats.imageModelTier);
                  if (!img) return null;
                  const item = await storeGenerated(ws.id, "image", img, phrase);
                  aiImages++;
                  return item.url;
              },
          }
        : {};

    const ctrl = new AbortController();
    return streamSSE(c, async (stream) =>
        // every model call inside this scope reports its tokens, sub-tools included
        withMeter(async (used) => {
            stream.onAbort(() => ctrl.abort());
            let seq = 0;
            const send = (event: TurnEvent): Promise<void> =>
                stream.writeSSE({ data: JSON.stringify({ seq: seq++, event }) });
            try {
                const workspace = makeWorkspaceReader(ws.id);
                for await (const ev of runTurn(req, {
                    models: overrides,
                    signal: ctrl.signal,
                    workspace,
                    image,
                    tier: feats.textModelTier,
                    maxSections: feats.maxSectionsPerGeneration,
                }))
                    await send(ev);
            } catch (e) {
                if (!ctrl.signal.aborted)
                    await send({
                        type: "error",
                        message: e instanceof Error ? e.message : "the turn failed",
                    });
            } finally {
                // Settle on what the turn really cost: tokens at provider list price, plus images at
                // their flat per-asset rate. Runs even after a mid-turn error, so real spend is billed.
                const owed = creditsForUsd(usdOf(used.uses)) + costOf({ image: aiImages });
                await settleCredits(ws, owed - cost, `${ACTION_FOR[req.kind]}:settle`);
            }
        }),
    );
});

// Metered like any other model call; `previous` marks a re-read, so the model rules that out and
// comes back with another angle.
ai.post("/ai/brief", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!aiReady()) return c.json({ brief: null });
    const body = await readJson<{ prompt?: string; surface?: Surface; previous?: BriefRead }>(c);
    if (!body?.prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);

    const spend = await chargeCredits(
        ws,
        estimateCost("draft-brief", {}, ratesFor(ws, overridesFrom(c))),
        "draft-brief",
    );
    if (!spend.ok)
        return c.json(
            { error: "out of AI credits", upgrade: true, remaining: spend.remaining },
            402,
        );

    try {
        const brief = await expandBrief(body.prompt.trim(), body.surface, {
            models: overridesFrom(c),
            tier: featuresFor(ws).textModelTier,
            previous: body.previous,
        });
        return c.json({ brief });
    } catch (e) {
        // refund a read that produced nothing — the user got no value from it
        await settleCredits(
            ws,
            -estimateCost("draft-brief", {}, ratesFor(ws, overridesFrom(c))),
            "draft-brief:refund",
        );
        warn(`[ai:brief] ${e instanceof Error ? e.message : "failed"}`.slice(0, 400));
        return c.json({ brief: null });
    }
});

// Unmetered: one tiny call, client-cached per artifact; empty on failure (the client falls back).
ai.post("/ai/suggest", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    if (!aiReady()) return c.json({ suggestions: [] });
    const body = await readJson<{ content?: ArtifactContent }>(c);
    if (!body?.content?.sections?.length) return c.json({ suggestions: [] });
    try {
        return c.json({
            suggestions: await suggestSections(body.content, { models: overridesFrom(c) }),
        });
    } catch {
        return c.json({ suggestions: [] });
    }
});

// Element rides along in the body — the runtime can't traverse the canvas tree.
ai.post("/ai/element", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson<{
        content?: ArtifactContent;
        sectionId?: string;
        element?: ElementInstance;
        instruction?: string;
    }>(c);
    if (!body?.content?.sections?.length || !body.sectionId || !body.element?.type)
        return c.json({ error: "content, sectionId, and element are required" }, 400);

    const spend = await chargeCredits(
        ws,
        estimateCost("revise-element", {}, ratesFor(ws, overridesFrom(c))),
        "revise-element",
    );
    if (!spend.ok)
        return c.json(
            { error: "out of AI credits", upgrade: true, remaining: spend.remaining },
            402,
        );

    try {
        const element = await reviseElement(
            body.content,
            body.sectionId,
            body.element,
            body.instruction,
            { tier: featuresFor(ws).textModelTier, models: overridesFrom(c) },
        );
        return c.json({ element });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "regeneration failed" }, 500);
    }
});

ai.post("/ai/text", requireWorkspace, async (c) => {
    const ws = c.get("ws");
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

    const tool = body.op === "translate" ? "translate-text" : "rewrite-text";
    const spend = await chargeCredits(ws, estimateCost(tool), tool);
    if (!spend.ok)
        return c.json(
            { error: "out of AI credits", upgrade: true, remaining: spend.remaining },
            402,
        );

    try {
        const tier = featuresFor(ws).textModelTier;
        const text =
            body.op === "translate"
                ? await translateText(body.text, body.language!.trim(), {
                      models: overridesFrom(c),
                      context: body.context,
                      tier,
                  })
                : await rewriteText(body.text, body.instruction!.trim(), {
                      models: overridesFrom(c),
                      context: body.context,
                      tier,
                  });
        return c.json({ text });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "the edit failed" }, 500);
    }
});

ai.post("/ai/theme", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson<{ prompt?: string; isDark?: boolean }>(c);
    if (!body?.prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);

    const spend = await chargeCredits(
        ws,
        estimateCost("generate-theme", {}, ratesFor(ws, overridesFrom(c))),
        "generate-theme",
    );
    if (!spend.ok)
        return c.json(
            { error: "out of AI credits", upgrade: true, remaining: spend.remaining },
            402,
        );

    try {
        const theme = await generateThemeFromPrompt(body.prompt.trim(), {
            models: overridesFrom(c),
            isDark: body.isDark,
            tier: featuresFor(ws).textModelTier,
        });
        return c.json({ theme });
    } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : "theme generation failed" }, 500);
    }
});
