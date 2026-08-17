import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getCookie } from "hono/cookie";
import type { Beat, GenerateInput, TurnEvent, TurnRequest } from "@model/ai";
import { applyPatch, isKind } from "@model/ai";
import { overridesFrom, requireWorkspace, type WorkspaceEnv } from "./middleware";
import type { ModelOverrides } from "@services/core/models";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import type { ModelTier } from "@model/billing";
import { featuresFor } from "@model/billing";
import { currentUser } from "@services/core/accounts";
import { SESSION_COOKIE } from "@services/utils/auth";
import { z } from "zod";
import { isArtifactContent } from "@services/core/artifacts";
import { OUT_OF_CREDITS, rateLimit, readJson } from "@services/utils/http";
import { warn } from "@services/utils/env";
import { ACTION_FOR, IMPLEMENTED, meterFor, ratesFor, reserve } from "@services/core/spend";
import {
    assetUrl,
    generateImage,
    imageGenReady,
    refImage,
    storeGenerated,
} from "@services/core/media";
import { isEvalAdmin, recordRun } from "@services/core/ai/eval/runs";
import { runChecks } from "@services/core/ai/eval/checks";
import type { EvalConfig, EvalStatus } from "@model/eval";
import { AI_TASKS } from "@model/credits";
import { modelFor } from "@services/core/models";
import { aiReady, embeddingReady } from "@services/core/ai/provider";
import { mintVoiceToken, voiceReady, VoiceError } from "@services/core/ai/voice";
import { runTurn } from "@services/core/ai/run";
import { makeContext } from "@services/core/ai/tools";
import { reviseElement } from "@services/core/ai/tools/element";
import type { ImageOptions } from "@services/core/ai/images";
import { makeWorkspaceReader } from "@services/core/ai/reader";
import {
    makeContextRetriever,
    recallConversation,
    recordChatExchange,
} from "@services/core/context";
import { expandBrief } from "@services/core/ai/tools/plan";
import { generateThemeFromPrompt } from "@services/core/ai/tools/theme";
import { rewriteText, translateText } from "@services/core/ai/tools/text";
import { refinePrompt } from "@services/core/ai/tools/refine";
import type { RefineKind } from "@services/core/ai/prompts/refine";
import { suggestSections } from "@services/core/ai/tools/suggest";
import type { BriefRead } from "@services/core/ai/prompts/brief";

// What the run was asked to do, in the same shape an artifact stores in ai_meta. The models
// recorded are the ones that actually ran, not the overrides that were requested.
// the models that will actually run, not the overrides that were asked for
function modelMap(overrides: ModelOverrides, tier: ModelTier): Record<string, string> {
    const models: Record<string, string> = {};
    for (const task of AI_TASKS) models[task] = modelFor(task, tier, overrides);
    return models;
}

function configOf(req: TurnRequest, overrides: ModelOverrides, tier: ModelTier): EvalConfig {
    const models = modelMap(overrides, tier);
    const input = req.kind === "build" ? req.input.brief : "input" in req ? req.input : undefined;
    const g = input as Partial<GenerateInput> | undefined;
    return {
        kind: req.kind,
        meta: {
            at: new Date().toISOString(),
            models,
            prompt: g?.prompt ?? "",
            surface: g?.surface ?? "deck",
            theme: g?.theme,
            length: g?.length,
            imageSource: g?.imageSource,
            goal: g?.goal,
            audience: g?.audience,
            tone: g?.tone,
            mustInclude: g?.mustInclude,
        },
    };
}

// A traced run rebuilds the artifact from its own patch stream. A build turn only patches the one
// section it writes, so it has to start from the artifact so far or the run would record a
// one-section piece.
const seedContent = (req: TurnRequest): ArtifactContent => {
    const input = "input" in req ? (req.input as { content?: ArtifactContent }) : undefined;
    if (input?.content?.sections) return input.content;
    const g = ("input" in req ? req.input : undefined) as Partial<GenerateInput> | undefined;
    return { format: g?.surface ?? "deck", theme: g?.theme ?? "studio", sections: [] };
};

export const ai = new Hono<WorkspaceEnv>();

ai.post("/ai/turn", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const req = await readJson(c, zTurn);
    if (!req || !isKind(req.kind)) return c.json({ error: "a valid turn kind is required" }, 400);
    if (!IMPLEMENTED.includes(req.kind))
        return c.json({ error: `${req.kind} turns aren’t available yet` }, 501);
    if ((req.kind === "generate" || req.kind === "plan") && !req.input?.prompt?.trim())
        return c.json({ error: "a prompt is required" }, 400);
    if (req.kind === "section" && (!req.input?.instruction?.trim() || !req.input?.content))
        return c.json({ error: "an instruction and the current artifact are required" }, 400);
    if (req.kind === "chat" && !req.input?.message?.trim())
        return c.json({ error: "a message is required" }, 400);
// The turn union and its per-kind inputs live in @model/ai; restating them here would be a second
// copy to keep in sync, and every route below narrows what it reads anyway. z.custom validates
// without rebuilding, so nothing the client sent is dropped on the way through.
const isObject = (v: unknown): boolean => !!v && typeof v === "object";
const zTurn = z.custom<TurnRequest>(isObject);
const zArtifactContent = z.custom<ArtifactContent>(isArtifactContent);
const zElement = z.custom<ElementInstance>(
    (v) => isObject(v) && typeof (v as { type?: unknown }).type === "string",
);

const zBrief = z.looseObject({
    prompt: z.string().optional(),
    surface: z.enum(["deck", "doc", "web"]).optional(),
    previous: z.custom<BriefRead>(isObject).optional(),
    trace: z.boolean().optional(),
    traceSession: z.string().optional(),
});
const zSuggest = z.object({ content: zArtifactContent.optional() });
const zElementEdit = z.object({
    content: zArtifactContent.optional(),
    sectionId: z.string().optional(),
    element: zElement.optional(),
    instruction: z.string().optional(),
});
const zText = z.object({
    op: z.enum(["rewrite", "translate"]).optional(),
    text: z.string().optional(),
    instruction: z.string().optional(),
    language: z.string().optional(),
    context: z.string().optional(),
});
const zRefine = z.object({
    prompt: z.string().optional(),
    kind: z.string().optional(),
    context: z.string().optional(),
});
const zThemeGen = z.object({ prompt: z.string().optional(), isDark: z.boolean().optional() });

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
    // a step pinned to a heavier model costs us more, so the reserve and the settle both price the
    // models this turn will actually run on
    const overrides = overridesFrom(c);
    // a client asking to trace changes nothing on its own; only an eval admin gets a run recorded
    const traced = !!req.trace && isEvalAdmin(c.get("user"));
    const held = await reserve(
        ws,
        c.get("user").id,
        ACTION_FOR[req.kind],
        meterFor(req, feats.maxSectionsPerGeneration),
        ratesFor(ws, overrides),
        traced,
    );
    if (!held.ok) return c.json(OUT_OF_CREDITS(ws, held.remaining), 402);

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
              generate: async (phrase, orientation, refUrl) => {
                  const aspect =
                      orientation === "portrait"
                          ? "3:4"
                          : orientation === "square"
                            ? "1:1"
                            : "16:9";
                  // a ref only exists for images we generated and stored; a stock url has no asset
                  const refId = refUrl?.startsWith(ASSET_PREFIX)
                      ? refUrl.slice(ASSET_PREFIX.length)
                      : undefined;
                  const ref = refId ? ((await refImage(ws.id, refId)) ?? undefined) : undefined;
                  const img = await generateImage(
                      phrase,
                      aspect,
                      "photo",
                      feats.imageModelTier,
                      ref,
                  );
                  if (!img) return null;
                  const item = await storeGenerated(ws.id, "image", img, phrase);
                  aiImages++;
                  return item.url;
              },
          }
        : {};

    // an asset url is the only ref we can resolve back to bytes
    const ASSET_PREFIX = assetUrl("");

    // attached context collections ground the turn; absent (or no embedding model) they cost nothing
    const contextIds =
        req.kind === "generate" || req.kind === "plan"
            ? req.input.contextIds
            : req.kind === "build"
              ? req.input.brief.contextIds
              : req.kind === "chat"
                ? req.input.context.contextIds
                : undefined;
    const retriever =
        embeddingReady() && contextIds?.length ? makeContextRetriever(ws.id, contextIds) : null;
    // conversation memory is keyed to the piece being discussed; a draft with no id yet is "library"
    const chatKey = req.kind === "chat" ? (req.input.context.artifactId ?? null) : null;

    const ctrl = new AbortController();
    return streamSSE(c, async (stream) =>
        held.settle(async (produced, meter) => {
            stream.onAbort(() => ctrl.abort());
            const startedAt = Date.now();
            let status: EvalStatus = "ok";
            let failure: string | undefined;
            let built: ArtifactContent | undefined;
            let seq = 0;
            const send = (event: TurnEvent): Promise<void> =>
                stream.writeSSE({ data: JSON.stringify({ seq: seq++, event }) });
            try {
                const workspace = makeWorkspaceReader(ws.id);
                let reply = "";
                for await (const ev of runTurn(req, {
                    models: overrides,
                    signal: ctrl.signal,
                    workspace,
                    image,
                    tier: feats.textModelTier,
                    maxSections: feats.maxSectionsPerGeneration,
                    pack: retriever ? retriever.pack : undefined,
                    recall:
                        req.kind === "chat" && embeddingReady()
                            ? (q) => recallConversation(ws.id, chatKey, q)
                            : undefined,
                })) {
                    if (ev.type === "chat.text") reply += ev.delta;
                    // the run's own copy of the result, so checks do not depend on the client
                    if (traced && ev.type === "patch")
                        built = applyPatch(built ?? seedContent(req), ev.ops);
                    await send(ev);
                }
                // memory is best-effort: a failed write must never fail the turn it remembers
                if (req.kind === "chat" && embeddingReady()) {
                    try {
                        await recordChatExchange(ws.id, chatKey, [
                            { role: "user", text: req.input.message },
                            { role: "assistant", text: reply },
                        ]);
                    } catch {
                        /* the turn already served; recall just won't see this exchange */
                    }
                }
            } catch (e) {
                failure = e instanceof Error ? e.message : "the turn failed";
                status = ctrl.signal.aborted ? "aborted" : "error";
                if (!ctrl.signal.aborted) await send({ type: "error", message: failure });
            } finally {
                // tokens are metered for us; images are flat-priced, so their count is ours to report
                produced({ image: aiImages });
                // a trace is a dev record, never worth failing a turn the user already received
                if (traced)
                    try {
                        await recordRun({
                            workspaceId: ws.id,
                            userId: c.get("user").id,
                            sessionId: req.traceSession ?? null,
                            config: configOf(req, overrides, feats.textModelTier),
                            spans: meter.uses,
                            content: built ?? null,
                            checks: built
                                ? runChecks(built, {
                                      surface: built.format,
                                      length: configOf(req, overrides, feats.textModelTier).meta
                                          .length,
                                  })
                                : [],
                            status: ctrl.signal.aborted ? "aborted" : status,
                            error: failure,
                            credits: 0, // settled after this block; the run row records tokens
                            ms: Date.now() - startedAt,
                        });
                    } catch (e) {
                        warn(`[eval] run not recorded: ${e instanceof Error ? e.message : "?"}`);
                    }
            }
        }),
    );
});

// Metered like any other model call; `previous` marks a re-read, so the model rules that out and
// comes back with another angle.
ai.post("/ai/brief", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!aiReady()) return c.json({ brief: null });
    const body = await readJson(c, zBrief);
    if (!body?.prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);
    const prompt = body.prompt.trim();
    const traced = !!body.trace && isEvalAdmin(c.get("user"));

    const held = await reserve(
        ws,
        c.get("user").id,
        "draft-brief",
        {},
        ratesFor(ws, overridesFrom(c)),
        traced,
    );
    if (!held.ok) return c.json(OUT_OF_CREDITS(ws, held.remaining), 402);

    return held.settle(async (_produced, meter) => {
        const startedAt = Date.now();
        try {
            const brief = await expandBrief(prompt, body.surface, {
                models: overridesFrom(c),
                tier: featuresFor(ws).textModelTier,
                previous: body.previous,
            });
            return c.json({ brief });
        } catch (e) {
            warn(`[ai:brief] ${e instanceof Error ? e.message : "failed"}`.slice(0, 400));
            return c.json({ brief: null });
        } finally {
            // the brief opens the session's run; the turns that follow append to it
            if (traced)
                try {
                    await recordRun({
                        workspaceId: ws.id,
                        userId: c.get("user").id,
                        sessionId: body.traceSession ?? null,
                        config: {
                            kind: "brief",
                            meta: {
                                at: new Date().toISOString(),
                                models: modelMap(overridesFrom(c), featuresFor(ws).textModelTier),
                                prompt,
                                surface: body.surface ?? "deck",
                            },
                        },
                        spans: meter.uses,
                        status: "ok",
                        credits: 0,
                        ms: Date.now() - startedAt,
                    });
                } catch (e) {
                    warn(`[eval] brief not recorded: ${e instanceof Error ? e.message : "?"}`);
                }
        }
    });
});

// Unmetered: one tiny call, client-cached per artifact; empty on failure (the client falls back).
ai.post("/ai/suggest", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    if (!aiReady()) return c.json({ suggestions: [] });
    const body = await readJson(c, zSuggest);
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
    const body = await readJson(c, zElementEdit);
    if (!body?.content?.sections?.length || !body.sectionId || !body.element?.type)
        return c.json({ error: "content, sectionId, and element are required" }, 400);
    const { content, sectionId, element: target } = body;

    const held = await reserve(
        ws,
        c.get("user").id,
        "revise-element",
        {},
        ratesFor(ws, overridesFrom(c)),
    );
    if (!held.ok) return c.json(OUT_OF_CREDITS(ws, held.remaining), 402);

    return held.settle(async () => {
        try {
            const element = await reviseElement(
                content,
                sectionId,
                target,
                makeContext({
                    image: {},
                    tier: featuresFor(ws).textModelTier,
                    models: overridesFrom(c),
                }),
                body.instruction,
            );
            return c.json({ element });
        } catch (e) {
            return c.json({ error: e instanceof Error ? e.message : "regeneration failed" }, 500);
        }
    });
});

ai.post("/ai/text", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson(c, zText);
    if (!body?.text?.trim() || (body.op !== "rewrite" && body.op !== "translate"))
        return c.json({ error: "op ('rewrite' | 'translate') and text are required" }, 400);
    if (body.op === "rewrite" && !body.instruction?.trim())
        return c.json({ error: "an instruction is required" }, 400);
    if (body.op === "translate" && !body.language?.trim())
        return c.json({ error: "a target language is required" }, 400);
    const instruction = body.instruction?.trim() ?? "";
    const language = body.language?.trim() ?? "";

    const source = body.text;
    const tool = body.op === "translate" ? "translate-text" : "rewrite-text";
    const held = await reserve(ws, c.get("user").id, tool, {}, ratesFor(ws, overridesFrom(c)));
    if (!held.ok) return c.json(OUT_OF_CREDITS(ws, held.remaining), 402);

    return held.settle(async () => {
        try {
            const tier = featuresFor(ws).textModelTier;
            const text =
                body.op === "translate"
                    ? await translateText(source, language, {
                          models: overridesFrom(c),
                          context: body.context,
                          tier,
                      })
                    : await rewriteText(source, instruction, {
                          models: overridesFrom(c),
                          context: body.context,
                          tier,
                      });
            return c.json({ text });
        } catch (e) {
            return c.json({ error: e instanceof Error ? e.message : "the edit failed" }, 500);
        }
    });
});

// User-triggered only: the refined text goes back to the box the user typed in, so nothing is spent
// on a generation they did not ask for. Every generation path still takes a plain prompt string.
const REFINE_KINDS = ["image", "video", "theme"] as const;

ai.post("/ai/refine", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson(c, zRefine);
    const prompt = body?.prompt?.trim() ?? "";
    const kind = body?.kind as RefineKind | undefined;
    if (!prompt || !kind || !REFINE_KINDS.includes(kind))
        return c.json({ error: "prompt and kind ('image' | 'video' | 'theme') are required" }, 400);

    const held = await reserve(
        ws,
        c.get("user").id,
        "refine-prompt",
        {},
        ratesFor(ws, overridesFrom(c)),
    );
    if (!held.ok) return c.json(OUT_OF_CREDITS(ws, held.remaining), 402);

    return held.settle(async () => {
        try {
            const refined = await refinePrompt(kind, prompt, {
                models: overridesFrom(c),
                context: body?.context,
                tier: featuresFor(ws).textModelTier,
            });
            return c.json({ prompt: refined });
        } catch (e) {
            return c.json(
                { error: e instanceof Error ? e.message : "refining the prompt failed" },
                500,
            );
        }
    });
});

const voiceLimiter = rateLimit({ name: "voice", limit: 30, windowMs: 60_000 });

ai.get("/ai/voice", requireWorkspace, (c) => c.json({ ready: voiceReady() }));

// dictation is unpriced (like ingestion): the limiter and the token's single use bound abuse
ai.post("/ai/voice-token", requireWorkspace, voiceLimiter, async (c) => {
    try {
        return c.json(await mintVoiceToken());
    } catch (e) {
        if (e instanceof VoiceError) return c.json({ error: e.message }, e.status);
        throw e;
    }
});

ai.post("/ai/theme", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson(c, zThemeGen);
    if (!body?.prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);
    const wanted = body.prompt.trim();

    const held = await reserve(
        ws,
        c.get("user").id,
        "generate-theme",
        {},
        ratesFor(ws, overridesFrom(c)),
    );
    if (!held.ok) return c.json(OUT_OF_CREDITS(ws, held.remaining), 402);

    return held.settle(async () => {
        try {
            const theme = await generateThemeFromPrompt(wanted, {
                models: overridesFrom(c),
                isDark: body.isDark,
                tier: featuresFor(ws).textModelTier,
            });
            return c.json({ theme });
        } catch (e) {
            return c.json(
                { error: e instanceof Error ? e.message : "theme generation failed" },
                500,
            );
        }
    });
});
