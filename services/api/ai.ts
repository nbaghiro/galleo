import { Hono } from "hono";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { getCookie } from "hono/cookie";
import type { Beat, BriefDraft, GenerateInput, TurnEvent, TurnRequest } from "@model/ai";
import type { Section } from "@model/artifact";
import { elementAt } from "@services/core/ai/locate";
import { applyPatch, isKind } from "@model/ai";
import type { ToolId } from "@model/tools";
import { runTool } from "@services/core/ai/execute";
import type { RunToolOptions, ToolOutcome } from "@services/core/ai/execute";
import type { Meter } from "@services/core/ai/meter";
import {
    gateArtifact,
    gateShared,
    isResponse,
    overridesFrom,
    requireWorkspace,
    type WorkspaceEnv,
} from "./middleware";
import type { ModelOverrides } from "@services/core/models";
import type { ArtifactContent } from "@model/artifact";
import type { ModelTier } from "@model/billing";
import { featuresFor } from "@model/billing";
import type { MediaItem } from "@model/media";
import { assetIdFromUrl } from "@model/media";
import { currentMembership, currentUser } from "@services/core/accounts";
import { SESSION_COOKIE } from "@services/utils/auth";
import { z } from "zod";
import { isArtifactContent } from "@services/core/artifacts";
import { creditRefusal, rateLimit, readJson } from "@services/utils/http";
import type { WorkspaceRow } from "@services/core/accounts";
import type { WorkspaceRole } from "@model/workspace";
import { warn } from "@services/utils/env";
import { ACTION_FOR, IMPLEMENTED, meterFor, ratesFor, reserve } from "@services/core/spend";
import {
    generateImage,
    imageGenReady,
    refImage,
    storeGenerated,
    useItem,
} from "@services/core/media";
import { isEvalAdmin, recordRun } from "@services/core/ai/eval/runs";
import { runChecks } from "@services/core/ai/eval/checks";
import type { EvalConfig, EvalStatus } from "@model/eval";
import { AI_TASKS } from "@model/credits";
import { modelFor } from "@services/core/models";
import { aiReady, embeddingReady } from "@services/core/ai/provider";
import { mintVoiceToken, voiceReady, VoiceError } from "@services/core/ai/voice";
import { runTurn } from "@services/core/ai/run";
import type { ImageOptions } from "@services/core/ai/images";
import { makeWorkspaceReader } from "@services/core/ai/reader";
import {
    makeContextRetriever,
    recallConversation,
    recordChatExchange,
} from "@services/core/context";
import type { RefineKind } from "@services/core/ai/prompts/refine";
import type { WrittenNotes } from "@services/core/ai/tools/notes";
import type { BriefRead } from "@services/core/ai/prompts/brief";

// What the run was asked to do, in the same shape an artifact stores in ai_meta. The models
// recorded are the ones that actually ran, not the overrides that were requested.
// the models that will actually run, not the overrides that were asked for
function modelMap(overrides: ModelOverrides, tier: ModelTier): Record<string, string> {
    const models: Record<string, string> = {};
    for (const task of AI_TASKS) models[task] = modelFor(task, tier, overrides);
    return models;
}

/**
 * `beats` is the outline's own reading of the arc, and it only exists once the plan step has run, so
 * the caller folds it in from the stream. Without it a visual check cannot ask what a section's
 * position was supposed to do, which is most of what makes a section right or wrong.
 */
// the starter a run borrowed its shapes from, wherever the brief for this turn kind lives
function shapeOf(req: TurnRequest): string | undefined {
    if (req.kind === "build") return req.input.brief.shapeTemplateId;
    return req.kind === "generate" || req.kind === "plan" ? req.input.shapeTemplateId : undefined;
}

function configOf(
    req: TurnRequest,
    overrides: ModelOverrides,
    tier: ModelTier,
    beats?: Beat[],
): EvalConfig {
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
            ...(beats?.length
                ? { beats: beats.map((b) => ({ id: b.id, label: b.label, role: b.role })) }
                : {}),
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

// A refused reserve is either the workspace running dry or this member hitting their own ceiling;
// only the first has an upgrade or a top-up to offer.

// The turn union and its per-kind inputs live in @model/ai; restating them here would be a second
// copy to keep in sync, and every route below narrows what it reads anyway. z.custom validates
// without rebuilding, so nothing the client sent is dropped on the way through.
const isObject = (v: unknown): boolean => !!v && typeof v === "object";
const zTurn = z.custom<TurnRequest>(isObject);
const zArtifactContent = z.custom<ArtifactContent>(isArtifactContent);

const zBrief = z.looseObject({
    prompt: z.string().optional(),
    surface: z.enum(["deck", "doc", "web"]).optional(),
    previous: z.custom<BriefRead>(isObject).optional(),
    trace: z.boolean().optional(),
    traceSession: z.string().optional(),
});
const zSuggest = z.object({ content: zArtifactContent.optional() });
// The path, not the element: the client has a selection and the server should revise what the
// stored tree holds at that address rather than whatever node the client pasted into the body.
const zElementEdit = z.object({
    content: zArtifactContent.optional(),
    sectionId: z.string().optional(),
    path: z.array(z.number().int().min(0)).optional(),
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

// zArtifactContent is a guard rather than a shape, so nothing the client sent is rebuilt: the notes
// writer reads the live tree, and a plain z.object would strip the fields this layer does not name
const zNotesReq = z.object({
    artifactId: z.string().optional(),
    content: zArtifactContent.optional(),
    sectionIds: z.array(z.string()).optional(),
    guidance: z.string().optional(),
});

// Sourced pictures are adopted at the turn rather than at the write, so the attribution the provider
// sent survives into the row and the turn streams canonical urls to the client.
const adoptInto =
    (wsId: string) =>
    async (item: MediaItem): Promise<string> =>
        (await useItem(wsId, item)).url;

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

    // The only turn that names an artifact server-side. The others are content-in/content-out, so
    // what protects them is the gate on the save plus the per-member spend cap, not a check here.
    if (req.kind === "chat" && req.input.context.artifactId) {
        const gate = await gateArtifact(c, req.input.context.artifactId, "view");
        if (isResponse(gate)) return gate;
    }

    // Reserve before the billable model calls; 402 when spent.
    const feats = featuresFor(ws);
    // a step pinned to a heavier model costs us more, so the reserve and the settle both price the
    // models this turn will actually run on
    const overrides = overridesFrom(c);
    // a client asking to trace changes nothing on its own; only an eval admin gets a run recorded
    const traced = !!req.trace && isEvalAdmin(c.get("user"));
    const held = await reserve(ws, c.get("user").id, ACTION_FOR[req.kind], {
        size: meterFor(req, feats.maxSectionsPerGeneration),
        rates: ratesFor(ws, overrides),
        trace: traced,
        role: c.get("role"),
        surface: "direct",
    });
    if (!held.ok) return c.json(creditRefusal(ws, held), 402);

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
    const image: ImageOptions = {
        adopt: adoptInto(ws.id),
        ...(wantsAiImages
            ? {
                  source: "ai" as const,
                  generate: async (phrase: string, orientation: string, refUrl?: string) => {
                      const aspect =
                          orientation === "portrait"
                              ? "3:4"
                              : orientation === "square"
                                ? "1:1"
                                : "16:9";
                      // a ref only resolves for an image we hold bytes for
                      const refId = assetIdFromUrl(refUrl);
                      const ref = refId ? ((await refImage(ws.id, refId)) ?? undefined) : undefined;
                      const img = await generateImage(
                          phrase,
                          aspect,
                          "photo",
                          feats.imageModelTier,
                          ref,
                      );
                      if (!img) return null;
                      const item = await storeGenerated(ws.id, "image", img, phrase, {
                          style: "photo",
                          ...(refId ? { refId } : {}),
                      });
                      aiImages++;
                      return item.url;
                  },
              }
            : {}),
    };

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
            let beats: Beat[] | undefined;
            let seq = 0;
            const send = (event: TurnEvent): Promise<void> =>
                stream.writeSSE({ data: JSON.stringify({ seq: seq++, event }) });
            try {
                const workspace = makeWorkspaceReader(ws.id, {
                    userId: c.get("user").id,
                    role: c.get("role"),
                    workspaceDefault: ws.defaultArtifactAccess,
                });
                let reply = "";
                for await (const ev of runTurn(req, {
                    models: overrides,
                    signal: ctrl.signal,
                    workspace,
                    // no `scopes`: a session-authenticated person holds the whole surface, which is
                    // the difference between them and a delegated token
                    principal: { userId: c.get("user").id, ws, role: c.get("role") },
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
                    if (traced && ev.type === "plan") beats = ev.beats;
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
                            config: configOf(req, overrides, feats.textModelTier, beats),
                            spans: meter.uses,
                            content: built ?? null,
                            checks: built
                                ? runChecks(built, {
                                      surface: built.format,
                                      length: configOf(req, overrides, feats.textModelTier).meta
                                          .length,
                                      shapeTemplateId: shapeOf(req),
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

// ---- the one direct-call envelope --------------------------------------------------------------
//
// Every route below runs its tool through the executor rather than calling the body and reserving
// beside it. That is what keeps one tool costing the same however it was reached: before this, a
// route named the tool id in its own reserve() while the same tool inside an agent turn reserved
// nothing, and the schema that validated an agent's arguments never ran on a route's. The route
// still owns its HTTP body shape, which is what check:validation asks for at the boundary.

const runDirect = <R>(
    c: Context<WorkspaceEnv>,
    id: ToolId,
    input: unknown,
    opts: Omit<Partial<RunToolOptions>, "ctx"> & {
        ctx?: Partial<RunToolOptions["ctx"]>;
        // Whose credits, when that is not the caller's own workspace. A route that gated on an
        // artifact passes its standing: a grant extends what someone may do to the owner's piece,
        // it does not move the bill onto them, and it does not let their plan decide whether the
        // owner's artifact may be worked on at all.
        on?: { ws: WorkspaceRow; role: WorkspaceRole | null };
    } = {},
): Promise<ToolOutcome<R>> => {
    const { on, ...rest } = opts;
    const ws = on?.ws ?? c.get("ws");
    const role = on ? (on.role ?? "member") : c.get("role");
    return runTool<R>(
        { id, surface: "direct", input },
        { userId: c.get("user").id, ws, role },
        {
            models: overridesFrom(c),
            ...rest,
            ctx: { image: { adopt: adoptInto(ws.id) }, ...rest.ctx },
        },
    );
};

// A stream has already sent its headers, so a refusal has to arrive as a line rather than a status.
function refusalText(out: Extract<ToolOutcome<unknown>, { ok: false }>): string {
    if (out.reason === "credits") return "Not enough credits to write these notes.";
    if (out.reason === "entitlement") return "That needs a higher plan.";
    if (out.reason === "bad-input") return out.issues.join("; ");
    return "that action is not available";
}

/** What a direct route answers when the executor refused before the body ever ran. */
function refused(
    c: Context<WorkspaceEnv>,
    out: Extract<ToolOutcome<unknown>, { ok: false }>,
): Response {
    const ws = c.get("ws");
    if (out.reason === "credits") return c.json(creditRefusal(ws, out), 402);
    if (out.reason === "entitlement")
        return c.json(
            { error: "That needs a higher plan.", reason: "feature" as const, upgrade: true },
            402,
        );
    if (out.reason === "bad-input") return c.json({ error: out.issues.join("; ") }, 400);
    // a route naming a tool that is not on its own surface is a wiring bug, not a caller's mistake
    return c.json({ error: "that action is not available" }, 500);
}

ai.post("/ai/brief", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!aiReady()) return c.json({ brief: null });
    const body = await readJson(c, zBrief);
    if (!body?.prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);
    const prompt = body.prompt.trim();
    const traced = !!body.trace && isEvalAdmin(c.get("user"));

    const startedAt = Date.now();
    const meters: Meter[] = [];
    let failed = false;
    const out = await runDirect<BriefDraft>(
        c,
        "draft-brief",
        { prompt, surface: body.surface, previous: body.previous },
        {
            trace: traced,
            onMeter: (m) => meters.push(m),
        },
    ).catch((e: unknown) => {
        warn(`[ai:brief] ${e instanceof Error ? e.message : "failed"}`.slice(0, 400));
        failed = true;
        return null;
    });
    if (out && !out.ok) return refused(c, out);

    // the brief opens the session's run; the turns that follow append to it
    const meter = meters[0];
    if (traced && meter)
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
                status: failed ? "error" : "ok",
                credits: 0,
                ms: Date.now() - startedAt,
            });
        } catch (e) {
            warn(`[eval] brief not recorded: ${e instanceof Error ? e.message : "?"}`);
        }

    // a brief that could not be written is not an error the caller acts on: the studio falls back
    // to the raw prompt, which is what it did before there was a brief step at all
    return failed || !out ? c.json({ brief: null }) : c.json({ brief: out.result });
});

// Unmetered: one tiny call, client-cached per artifact; empty on failure (the client falls back).
ai.post("/ai/suggest", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    if (!aiReady()) return c.json({ suggestions: [] });
    const body = await readJson(c, zSuggest);
    if (!body?.content?.sections?.length) return c.json({ suggestions: [] });
    // Unmetered, so it has no workspace of its own to run against; the executor still owns the
    // surface check and the schema, which is the part every caller has to share.
    const seat = await currentMembership(u.id);
    if (!seat) return c.json({ suggestions: [] });
    const out = await runTool<string[]>(
        { id: "suggest-sections", surface: "direct", input: {} },
        { userId: u.id, ws: seat.ws, role: seat.role },
        { models: overridesFrom(c), ctx: { image: {}, artifact: body.content } },
    ).catch(() => null);
    return c.json({ suggestions: out?.ok ? out.result : [] });
});

// Element rides along in the body — the runtime can't traverse the canvas tree.
ai.post("/ai/element", requireWorkspace, async (c) => {
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson(c, zElementEdit);
    if (!body?.content?.sections?.length || !body.sectionId || !body.path)
        return c.json({ error: "content, sectionId, and path are required" }, 400);
    const { content, sectionId, path } = body;

    // The editor points with a selection, so it hands over the path and the tool resolves the node
    // itself. It used to post the element object, which meant the server revised whatever the client
    // pasted in rather than what the stored tree holds at that address.
    const out = await runDirect<Section>(
        c,
        "revise-element",
        { sectionId, path, instruction: body.instruction },
        { ctx: { artifact: content } },
    ).catch((e: unknown) => (e instanceof Error ? e.message : "regeneration failed"));
    if (typeof out === "string") return c.json({ error: out }, 500);
    if (!out.ok) return refused(c, out);
    const element = elementAt(out.result.root, path);
    return element
        ? c.json({ element })
        : c.json({ error: "that element is no longer there" }, 409);
});

ai.post("/ai/text", requireWorkspace, async (c) => {
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

    // One route, two tools. The `op` field is the editor's menu rather than the catalog's shape, so
    // it picks which tool runs and the executor prices each one as itself.
    const out = await runDirect<string>(
        c,
        body.op === "translate" ? "translate-text" : "rewrite-text",
        body.op === "translate"
            ? { text: body.text, language, context: body.context }
            : { text: body.text, instruction, context: body.context },
    ).catch((e: unknown) => (e instanceof Error ? e.message : "the edit failed"));
    if (typeof out === "string") return c.json({ error: out }, 500);
    return out.ok ? c.json({ text: out.result }) : refused(c, out);
});

// User-triggered only: the refined text goes back to the box the user typed in, so nothing is spent
// on a generation they did not ask for. Every generation path still takes a plain prompt string.
const REFINE_KINDS = ["image", "video", "theme"] as const;

ai.post("/ai/refine", requireWorkspace, async (c) => {
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson(c, zRefine);
    const prompt = body?.prompt?.trim() ?? "";
    const kind = body?.kind as RefineKind | undefined;
    if (!prompt || !kind || !REFINE_KINDS.includes(kind))
        return c.json({ error: "prompt and kind ('image' | 'video' | 'theme') are required" }, 400);

    const out = await runDirect<string>(c, "refine-prompt", {
        prompt,
        kind,
        context: body?.context,
    }).catch((e: unknown) => (e instanceof Error ? e.message : "refining the prompt failed"));
    if (typeof out === "string") return c.json({ error: out }, 500);
    return out.ok ? c.json({ prompt: out.result }) : refused(c, out);
});

const voiceLimiter = rateLimit({ name: "voice", limit: 30, windowMs: 60_000 });

// Streamed because a whole-deck write takes most of a minute: each section lands on the canvas as
// it arrives rather than after the last one. Metered by how many sections the model had to read.
ai.post("/ai/notes", requireWorkspace, async (c) => {
    const body = await readJson(c, zNotesReq);
    if (!body?.content) return c.json({ error: "content is required" }, 400);
    const content = body.content;
    if (!content.sections.length) return c.json({ error: "this piece has no sections" }, 400);
    // gateShared rather than gateArtifact: a collaborator granted edit from outside the workspace can
    // already narrate a piece, so refusing them its notes would be an odd half-permission. The
    // artifact's workspace then pays, the same way narration does: notes are stored on the owner's
    // piece and feed the owner's narration cache, so the bill belongs where the work lands. With no
    // artifact named (the generation studio, before anything is saved) the caller's own is the only
    // workspace there is.
    let on: { ws: WorkspaceRow; role: WorkspaceRole | null } | undefined;
    if (body.artifactId) {
        const gate = await gateShared(c, body.artifactId, "edit");
        if (isResponse(gate)) return gate;
        on = { ws: gate.ws, role: gate.role };
    }
    // After the gate on purpose: whether this server has a model configured is not something to
    // tell a caller who cannot see the artifact they asked about.
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);

    const targets = body.sectionIds?.length ? body.sectionIds : content.sections.map((s) => s.id);
    let written = 0;
    return streamSSE(c, async (stream) => {
        const send = (data: unknown): Promise<void> =>
            stream.writeSSE({ data: JSON.stringify(data) });
        const out = await runDirect<WrittenNotes[]>(
            c,
            "write-speaker-notes",
            { sectionIds: body.sectionIds, guidance: body.guidance },
            {
                size: { sections: targets.length },
                ctx: { artifact: content },
                ...(on ? { on } : {}),
                // a run that wrote nothing owes nothing; a partial one owes what it read
                produced: () => ({ text: written ? targets.length : 0 }),
            },
        ).catch((e: unknown) => (e instanceof Error ? e.message : "failed"));

        if (typeof out === "string") {
            await send({ type: "error", message: out });
        } else if (!out.ok) {
            await send({ type: "error", message: refusalText(out) });
        } else {
            for (const row of out.result) {
                written++;
                await send({ type: "notes", ...row });
            }
        }
        await send({ type: "done", written });
    });
});

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
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const body = await readJson(c, zThemeGen);
    if (!body?.prompt?.trim()) return c.json({ error: "a prompt is required" }, 400);
    const wanted = body.prompt.trim();

    const out = await runDirect<unknown>(c, "generate-theme", {
        prompt: wanted,
        isDark: body.isDark,
    }).catch((e: unknown) => (e instanceof Error ? e.message : "theme generation failed"));
    if (typeof out === "string") return c.json({ error: out }, 500);
    return out.ok ? c.json({ theme: out.result }) : refused(c, out);
});
