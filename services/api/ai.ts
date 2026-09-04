import { Hono } from "hono";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { getCookie } from "hono/cookie";
import type { ChatInput, GenerateInput, TurnEvent } from "@model/ai";
import { threadKey } from "@model/ai";
import type { Section } from "@model/artifact";
import { elementAt } from "@services/core/ai/locate";
import type { ToolId } from "@model/tools";
import { TOOLS, isChatInput } from "@model/tools";
import { runTool } from "@services/core/ai/execute";
import type { RunToolOptions, ToolOutcome } from "@services/core/ai/execute";
import {
    gateArtifact,
    gateShared,
    isResponse,
    overridesFrom,
    requireWorkspace,
    streamRun,
    type WorkspaceEnv,
} from "./middleware";
import type { ArtifactContent } from "@model/artifact";
import { featuresFor } from "@model/billing";
import { currentMembership, currentUser } from "@services/core/accounts";
import { SESSION_COOKIE } from "@services/utils/auth";
import { z } from "zod";
import { isArtifactContent } from "@services/core/artifacts";
import { creditRefusal, rateLimit, readJson } from "@services/utils/http";
import type { WorkspaceRow } from "@services/core/accounts";
import type { WorkspaceRole } from "@model/workspace";
import { aiImageOptions } from "@services/core/media";
import { aiReady, embeddingReady } from "@services/core/ai/provider";
import { mintVoiceToken, voiceReady, VoiceError } from "@services/core/ai/voice";
import { makeWorkspaceReader } from "@services/core/ai/reader";
import { makeGenerationStore } from "@services/core/generations";
import { appendExchange } from "@services/core/threads";
import {
    makeContextRetriever,
    recallConversation,
    recordChatExchange,
} from "@services/core/context";
import type { RefineKind } from "@services/core/ai/prompts/refine";
import type { WrittenNotes } from "@services/core/ai/tools/notes";

export const ai = new Hono<WorkspaceEnv>();

// The tool's own schema parses `input` inside the executor; this states only the envelope, so
// nothing the client sent is dropped on the way through.
const isObject = (v: unknown): boolean => !!v && typeof v === "object";
const zArtifactContent = z.custom<ArtifactContent>(isArtifactContent);
const zTurn = z.object({
    tool: z.string(),
    input: z.custom<Record<string, unknown>>(isObject),
    // the document the browser holds, for a tool that acts on it; a generation's draft is loaded
    // server-side instead
    artifact: zArtifactContent.optional(),
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

// the brief a streamed call is about: its own, its generation's, or the chat's
const briefOf = (
    tool: ToolId,
    input: Record<string, unknown>,
    gen: { brief: GenerateInput } | null,
): Partial<GenerateInput> | undefined => {
    if (gen) return gen.brief;
    if (tool === "generate-artifact" || tool === "start-generation")
        return input as Partial<GenerateInput>;
    return undefined;
};

/**
 * One streamed tool call. The executor does the gate, the hold, the generation and the patches; this
 * route only names the tool, builds the context the workspace lends it, and frames the events as SSE.
 */
ai.post("/ai/turn", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!aiReady()) return c.json({ error: "AI is not configured on this server" }, 503);
    const req = await readJson(c, zTurn);
    if (!req || !(req.tool in TOOLS)) return c.json({ error: "a valid tool is required" }, 400);
    const tool = req.tool as ToolId;
    if (!TOOLS[tool].surfaces.includes("direct"))
        return c.json({ error: "that tool is not available here" }, 400);
    const input = req.input;
    if (tool === "ask-assistant" && (!isChatInput(input) || !input.message.trim()))
        return c.json({ error: "a message is required" }, 400);
    const chat: ChatInput | null = tool === "ask-assistant" && isChatInput(input) ? input : null;

    // The only call that names an artifact server-side without a generation. The others are
    // content-in/content-out, so what protects them is the gate on the save plus the per-member
    // spend cap, not a check here.
    if (chat?.context.artifactId && !chat.context.generationId) {
        const gate = await gateArtifact(c, chat.context.artifactId, "view");
        if (isResponse(gate)) return gate;
    }

    const feats = featuresFor(ws);
    const overrides = overridesFrom(c);
    const generations = makeGenerationStore(ws.id, c.get("user").id);

    // The generation a call is about decides its image strategy and its attached contexts. Read
    // once here for those; the executor loads it again for the body, which is what keeps this
    // route free of anything the body depends on.
    const generationId =
        (typeof input.generationId === "string" ? input.generationId : undefined) ??
        chat?.context.generationId;
    const gen = generationId ? await generations.read(generationId) : null;
    if (generationId && !gen) return c.json({ error: "that generation was not found" }, 404);
    const brief = briefOf(tool, input, gen?.generation ?? null);
    const imageSource = chat ? chat.context.imageSource : brief?.imageSource;
    const images = aiImageOptions(ws, feats, imageSource);

    // attached context collections ground the turn; absent (or no embedding model) they cost nothing
    const contextIds = chat ? chat.context.contextIds : brief?.contextIds;
    const retriever =
        embeddingReady() && contextIds?.length ? makeContextRetriever(ws.id, contextIds) : null;
    // conversation memory is keyed to the piece being discussed; a draft with no id yet is "library"
    const chatKey = chat ? (chat.context.generationId ?? chat.context.artifactId ?? null) : null;

    const ctrl = new AbortController();
    let seq = 0;
    let reply = "";
    const streamed: TurnEvent[] = []; // a chat turn's record, appended to the thread at the end
    const workspace = makeWorkspaceReader(ws.id, {
        userId: c.get("user").id,
        role: c.get("role"),
        workspaceDefault: ws.defaultArtifactAccess,
    });
    return streamRun(c, {
        abort: ctrl,
        head: [{ seq: seq++, event: { type: "turn.start", tool } }],
        frame: (event) => ({ seq: seq++, event }),
        refused: (out) => refused(c, out),
        run: ({ onHeld, onEvent }) =>
            runTool(
                { id: tool, surface: "direct", input },
                // no `scopes`: a session-authenticated person holds the whole surface, which is
                // the difference between them and a delegated token
                { userId: c.get("user").id, ws, role: c.get("role") },
                {
                    ctx: {
                        image: images.image,
                        workspace,
                        generations,
                        signal: ctrl.signal,
                        models: overrides,
                        maxSections: feats.maxSectionsPerGeneration,
                        pack: retriever ? retriever.pack : undefined,
                        recall:
                            chat && embeddingReady()
                                ? (q) => recallConversation(ws.id, chatKey, q)
                                : undefined,
                        // the document the browser holds rides in the body; the executor loads a
                        // generation's draft instead when the call names one
                        ...(chat && chat.context.content && !chat.context.generationId
                            ? { artifact: chat.context.content }
                            : req.artifact && !generationId
                              ? { artifact: req.artifact }
                              : {}),
                        ...(chat?.context.pending ? { pending: chat.context.pending } : {}),
                    },
                    models: overrides,
                    // tokens are metered for us; images are flat-priced, so their count is ours to report
                    produced: () => ({ image: images.made() }),
                    onHeld,
                    onEvent: (ev) => {
                        if (ev.type === "chat.text") reply += ev.delta;
                        if (chat) streamed.push(ev);
                        onEvent(ev);
                    },
                },
            ),
        tail: async (out) => {
            const frames: unknown[] = [];
            if (out instanceof Error) {
                if (!ctrl.signal.aborted)
                    frames.push({
                        seq: seq++,
                        event: { type: "error", message: out.message || "the turn failed" },
                    });
            } else if (!out.ok) {
                // held, then refused mid-run (a sub-tool's refusal): a line is all that is left
                frames.push({ seq: seq++, event: { type: "error", message: refusalText(out) } });
            } else
                frames.push({
                    seq: seq++,
                    event: {
                        type: "turn.done",
                        result: out.result,
                        ...(out.traceId ? { traceId: out.traceId } : {}),
                    },
                });
            // memory is best-effort: a failed write must never fail the turn it remembers
            if (chat) {
                try {
                    await appendExchange(
                        ws.id,
                        c.get("user").id,
                        threadKey(chat.context),
                        chat.message,
                        streamed,
                    );
                } catch {
                    /* the turn already served; the dock just won't reopen this exchange */
                }
                if (embeddingReady())
                    try {
                        await recordChatExchange(ws.id, chatKey, [
                            { role: "user", text: chat.message },
                            { role: "assistant", text: reply },
                        ]);
                    } catch {
                        /* the turn already served; recall just won't see this exchange */
                    }
            }
            return frames;
        },
    });
});

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
            ctx: { image: aiImageOptions(ws, featuresFor(ws), undefined).image, ...rest.ctx },
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
            {
                error: "That needs a higher plan.",
                reason: "feature" as const,
                feature: out.feature,
                upgrade: true,
            },
            402,
        );
    if (out.reason === "bad-input") return c.json({ error: out.issues.join("; ") }, 400);
    // a route naming a tool that is not on its own surface is a wiring bug, not a caller's mistake
    return c.json({ error: "that action is not available" }, 500);
}

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
