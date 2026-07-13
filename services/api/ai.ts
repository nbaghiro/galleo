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

export const ai = new Hono();

// Which priced tool each turn kind bills as.
const ACTION_FOR: Record<TurnKind, ToolId> = {
    generate: "generate-artifact",
    edit: "revise-artifact",
    section: "add-section",
    chat: "ask-assistant",
};

// Pre-flight meter knobs — only generate scales (length + AI-image source).
const meterFor = (req: TurnRequest): MeterParams =>
    req.kind === "generate" ? { length: req.input.length, imageSource: req.input.imageSource } : {};

// Others 501 before any charge (blocking here avoids reserving credits for an unbuildable kind).
const IMPLEMENTED: readonly TurnKind[] = ["generate", "section", "chat"];

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

    // Reserve before the billable model calls; 402 when spent.
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

    // Chat is agentic: chained sub-tools report usage via onUsage, billed on top of the reserve; non-chat leaves extra empty.
    let extra: Usage = {};
    const onUsage = (u: Usage): void => {
        extra = mergeUsage(extra, u);
    };

    // Stock by default (free). AI images are counted so the turn can reconcile the estimate to the real count (stock fallback unbilled).
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
        stream.onAbort(() => ctrl.abort());
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
            // Reconcile the reserve to what actually ran (runs even on a mid-turn error, so real spend is still billed).
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

// Unmetered: one tiny call, client-cached per artifact; empty on failure (client has a deterministic fallback).
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
