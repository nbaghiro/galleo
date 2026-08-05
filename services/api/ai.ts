import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getCookie } from "hono/cookie";
import type { Surface, TurnEvent, TurnRequest, TurnKind } from "@model/ai";
import { isKind } from "@model/ai";
import type { ToolId, MeterParams } from "@model/tools";
import { estimateCost, estimateUsage, sectionsForLength } from "@model/tools";
import type { Usage } from "@model/credits";
import { costOf, mergeUsage } from "@model/credits";
import { db, schema } from "../schema";
import { chargeCredits, settleCredits } from "../credits";
import { SESSION_COOKIE } from "../auth";
import { currentUser, currentWorkspace, readJson } from "./context";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { aiReady } from "../ai/provider";
import { reviseElement, runTurn } from "../ai/run";
import type { ImageOptions } from "../ai/run";
import { generateImage, imageGenReady } from "../media/generate";
import { makeWorkspaceReader } from "./workspace-reader";
import { featuresFor } from "../features";
import { rewriteText, translateText } from "../ai/text";
import { suggestSections } from "../ai/suggest";
import { generateThemeFromPrompt } from "../ai/theme";
import { expandBrief } from "../ai/brief";
import type { BriefRead } from "../ai/prompts/brief";
import { warn } from "../log";
import { overridesFrom } from "./model-debug";

export const ai = new Hono();

// Which priced tool each turn kind bills as.
const ACTION_FOR: Record<TurnKind, ToolId> = {
    generate: "generate-artifact",
    edit: "revise-artifact",
    section: "add-section",
    chat: "ask-assistant",
    plan: "plan-outline",
    build: "add-section",
};

// Only generate scales; the plan's section cap clamps the metered size, so a Free "In-depth" brief
// is billed for (and gets) 10 sections.
const meterFor = (req: TurnRequest, maxSections?: number): MeterParams =>
    req.kind === "generate"
        ? {
              length: req.input.length,
              imageSource: req.input.imageSource,
              ...(maxSections
                  ? { sections: Math.min(sectionsForLength(req.input.length), maxSections) }
                  : {}),
          }
        : {};

// Others 501 before any charge (blocking here avoids reserving credits for an unbuildable kind).
const IMPLEMENTED: readonly TurnKind[] = ["generate", "section", "chat", "plan", "build"];

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
    const cost = estimateCost(ACTION_FOR[req.kind], meter);
    const spend = await chargeCredits(ws, cost, ACTION_FOR[req.kind]);
    if (!spend.ok)
        return c.json(
            { error: "out of AI credits", upgrade: true, remaining: spend.remaining },
            402,
        );

    // Chat is agentic: chained sub-tools bill on top of the reserve; non-chat leaves this empty.
    let extra: Usage = {};
    const onUsage = (u: Usage): void => {
        extra = mergeUsage(extra, u);
    };

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
        stream.onAbort(() => ctrl.abort());
        let seq = 0;
        const send = (event: TurnEvent): Promise<void> =>
            stream.writeSSE({ data: JSON.stringify({ seq: seq++, event }) });
        try {
            const workspace = makeWorkspaceReader(ws.id);
            for await (const ev of runTurn(req, {
                models: overridesFrom(c),
                signal: ctrl.signal,
                workspace,
                onUsage,
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
            // Reconcile the reserve to what actually ran (runs even on a mid-turn error, so real spend is still billed).
            let owed = cost;
            if (Object.keys(extra).length) owed += costOf(extra);
            if (wantsAiImages)
                // A generation reserved for images (recompute from the real count); chat reserved
                // none (add on top of what its tools owe).
                owed =
                    req.kind === "chat"
                        ? owed + costOf({ image: aiImages })
                        : costOf({
                              ...estimateUsage(ACTION_FOR[req.kind], meter),
                              image: aiImages,
                          });
            await settleCredits(ws, owed - cost, `${ACTION_FOR[req.kind]}:settle`);
        }
    });
});

// Metered like any other model call; `previous` marks a re-read, so the model rules that out and
// comes back with another angle.
ai.post("/ai/brief", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!aiReady()) return c.json({ brief: null });
    const body = await readJson<{ prompt?: string; surface?: Surface; previous?: BriefRead }>(c);
    if (!body?.prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);

    const spend = await chargeCredits(ws, estimateCost("draft-brief"), "draft-brief");
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
        await settleCredits(ws, -estimateCost("draft-brief"), "draft-brief:refund");
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

    const spend = await chargeCredits(ws, estimateCost("revise-element"), "revise-element");
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

ai.post("/ai/theme", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const ws = await currentWorkspace(u.id);
    if (!ws) return c.json({ error: "no workspace" }, 400);
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson<{ prompt?: string; isDark?: boolean }>(c);
    if (!body?.prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);

    const spend = await chargeCredits(ws, estimateCost("generate-theme"), "generate-theme");
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
