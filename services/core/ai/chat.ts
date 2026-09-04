import { ToolLoopAgent, stepCountIs, tool } from "ai";
import type { ModelMessage, ToolSet } from "ai";
import type { ChatBlock, ChatInput, Patch, TurnEvent, WorkspaceAction } from "@model/ai";
import { emptyPatch } from "@model/ai";
import type { Section } from "@model/artifact";
import { confirmFor, estimateCost, TOOLS } from "@model/tools";
import { modelCall } from "./provider";
import { modelFor, modelNote } from "@services/core/models";
import { chatSystem } from "./prompts/chat";
import { firstText, heading, retrievedContext, stack } from "./prompts/system";
import { thinkingSteps } from "./thinking";
import { implement, offeredTo } from "./tools";
import type { Tool, ToolContext } from "./tools";
import { runTool } from "./execute";
import type { ToolOutcome } from "./execute";
import { generationSize } from "./tools/generation";

// The chat agent: an AI SDK tool loop whose toolset is the catalog's agent surface filtered by what
// the context holds. Chat owns nothing about a capability except how its result is shown, and even
// that falls to the generic presenter unless the tool declares its own.

function createChannel<T>() {
    const buf: T[] = [];
    let notify: (() => void) | null = null;
    let closed = false;
    return {
        push(v: T): void {
            buf.push(v);
            notify?.();
            notify = null;
        },
        close(): void {
            closed = true;
            notify?.();
            notify = null;
        },
        async *drain(): AsyncGenerator<T> {
            for (;;) {
                while (buf.length) yield buf.shift() as T;
                if (closed) return;
                await new Promise<void>((r) => (notify = r));
            }
        },
    };
}

type AnyTool = Tool<never, unknown>;

const clip = (s: string, n: number): string =>
    s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;

const isSection = (v: unknown): v is Section =>
    !!v && typeof v === "object" && "id" in v && "root" in v;
const isAction = (v: unknown): v is WorkspaceAction =>
    !!v && typeof v === "object" && typeof (v as WorkspaceAction).kind === "string";

// several patches from one call land as one card, so applying it is one act
function mergePatches(patches: Patch[]): Patch {
    const merged: Patch = {};
    for (const p of patches) {
        if (p.artifact?.length) merged.artifact = [...(merged.artifact ?? []), ...p.artifact];
        if (p.generation?.length)
            merged.generation = [...(merged.generation ?? []), ...p.generation];
        if (p.workspace) merged.workspace = p.workspace;
    }
    return merged;
}

// the section a patch puts on the page, when it puts exactly one there
function previewOf(result: unknown, patch: Patch): Section | undefined {
    if (isSection(result)) return result;
    const sections = (patch.artifact ?? []).flatMap((op) =>
        op.op === "addSection" || op.op === "replaceSection" ? [op.section] : [],
    );
    return sections.length === 1 ? sections[0] : undefined;
}

function summaryOf(t: AnyTool, result: unknown, input: unknown): string {
    const own = (result as { summary?: unknown } | null)?.summary;
    if (typeof own === "string" && own) return own;
    const given = (input as { summary?: unknown } | null)?.summary;
    if (typeof given === "string" && given) return given;
    const title = TOOLS[t.id].title;
    return isSection(result) ? `${title}: “${clip(firstText(result) || result.id, 40)}”` : title;
}

// What the model reads back when the tool declares no note: the string it returned, or what the
// card says, so a follow-up turn knows what stands.
function noteOf(t: AnyTool, result: unknown, blocks: ChatBlock[]): string {
    if (t.note) return t.note(result, undefined);
    if (typeof result === "string") return result;
    const card = blocks.find((b) => b.type === "proposal");
    if (card && card.type === "proposal")
        return `Proposed: ${card.summary}. The user applies or discards it.`;
    if (Array.isArray(result)) return `${result.length} result${result.length === 1 ? "" : "s"}.`;
    return "Done.";
}

// What the model is told when the executor turns a call away. It reads this and explains it, so it
// is a sentence rather than a code.
function refusalNote(out: Exclude<ToolOutcome<unknown>, { ok: true }>, id: string): string {
    if (out.reason === "entitlement") return `That needs a higher plan on this workspace.`;
    if (out.reason === "credits") return `There are not enough credits left for that.`;
    if (out.reason === "bad-input")
        return `Those arguments were not valid: ${out.issues.join("; ")}`;
    if (out.reason === "not-found") return out.message;
    if (out.reason === "busy")
        return "A section is being written right now; ask again once it lands.";
    return `“${id}” is not available here.`;
}

export async function* runChat(input: ChatInput, ctx: ToolContext): AsyncGenerator<TurnEvent> {
    const override = modelNote(ctx.models, ["chat"]);
    if (override) yield { type: "narration", text: "Model override", mono: ` · ${override}` };
    const ch = createChannel<TurnEvent>();
    const format = ctx.artifact?.format;
    const generationId = ctx.generation?.id;

    const wrap = (t: AnyTool) =>
        tool({
            description: t.describe,
            inputSchema: t.input,
            execute: async (raw: unknown, { toolCallId }: { toolCallId: string }) => {
                const def = TOOLS[t.id];
                const confirm = confirmFor(t.id);
                ch.push({ type: "chat.tool", blockId: toolCallId, tool: t.id, title: def.title });
                // the run in progress is the only one there is, so a call may leave its id implied
                const input =
                    generationId && def.needs?.includes("generation")
                        ? { generationId, ...(raw as object) }
                        : raw;
                try {
                    if (confirm === "before") {
                        const size = generationSize(t.id, input, ctx.generation);
                        const block: ChatBlock = {
                            type: "proposal",
                            id: crypto.randomUUID(),
                            tool: t.id,
                            summary: summaryOf(t, null, input),
                            cost: estimateCost(t.id, size ?? undefined),
                            call: { input },
                        };
                        ch.push({ type: "chat.block", blockId: toolCallId, block });
                        return `Offered “${def.title}” as a card (${block.id}). Nothing runs until the user starts it, so do not say it happened.`;
                    }
                    // Through the executor, like every other surface: the surface check, the tool's
                    // own schema and the entitlement gate all apply here too. `holds: "caller"`
                    // because the turn already reserved once and settles for the whole thing.
                    const forward = (event: TurnEvent): void => {
                        // a patch the user has not approved is the card's, not the page's
                        if (event.type === "patch" && confirm !== "never") return;
                        ch.push({ type: "chat.nested", blockId: toolCallId, event });
                    };
                    const ran = ctx.principal
                        ? await runTool({ id: t.id, surface: "agent", input }, ctx.principal, {
                              ctx,
                              holds: "caller",
                              apply: confirm === "never",
                              onEvent: forward,
                          })
                        : await unmetered(t, input, ctx, forward);
                    if (!ran.ok) return refusalNote(ran, t.id);
                    const merged = mergePatches(ran.patches);
                    const own = t.present?.(ran.result, input, ran.patches);
                    const blocks: ChatBlock[] =
                        own === undefined
                            ? presentDefault(t, ran.result, input, merged, confirm)
                            : Array.isArray(own)
                              ? own
                              : own
                                ? [own]
                                : [];
                    for (const block of blocks)
                        ch.push({ type: "chat.block", blockId: toolCallId, block });
                    return noteOf(t, ran.result, blocks);
                } catch (e) {
                    ch.push({
                        type: "chat.text",
                        delta: `\n\n_(That didn't work: ${e instanceof Error ? e.message : "error"}.)_`,
                    });
                    return "That action failed.";
                } finally {
                    // a tool whose result has nothing to show still has to close its own shell
                    ch.push({
                        type: "chat.tool",
                        blockId: toolCallId,
                        tool: t.id,
                        title: def.title,
                        done: true,
                    });
                }
            },
        });

    const presentDefault = (
        t: AnyTool,
        result: unknown,
        input: unknown,
        patch: Patch,
        confirm: ReturnType<typeof confirmFor>,
    ): ChatBlock[] => {
        if (isAction(result))
            return [{ type: "action", action: result, confirm: confirm === "before" }];
        if (confirm === "never" || emptyPatch(patch)) return [];
        return [
            {
                type: "proposal",
                id: crypto.randomUUID(),
                tool: t.id,
                summary: summaryOf(t, result, input),
                patch,
                preview: previewOf(result, patch),
                ...(format ? { format } : {}),
            },
        ];
    };

    const offered = offeredTo(ctx);
    const tools: ToolSet = Object.fromEntries(offered.map((t) => [t.id, wrap(t)]));

    // both are best-effort: a retrieval hiccup degrades to an ungrounded (but honest) turn
    const packText = (await ctx.pack?.(input.message).catch(() => null)) ?? null;
    const recallText = (await ctx.recall?.(input.message).catch(() => null)) ?? null;

    const agent = new ToolLoopAgent({
        ...modelCall(modelFor("chat", ctx.tier, ctx.models)),
        instructions: stack(
            chatSystem({
                context: input.context,
                generation: ctx.generation,
                content: ctx.artifact,
                tools: offered.map((t) => ({ id: t.id, describe: t.describe })),
            }),
            retrievedContext(packText),
            recallText
                ? heading("Earlier in this conversation (recalled, possibly relevant)", recallText)
                : undefined,
            ctx.pack
                ? "The user attached context collections to this conversation. search-context digs into them; the excerpts above were retrieved for this message."
                : undefined,
        ),
        tools,
        stopWhen: stepCountIs(6),
        // thinking summaries come back in the stream; the client shows them as a progress bubble
        providerOptions: { google: { thinkingConfig: { includeThoughts: true } } },
    });

    const messages: ModelMessage[] = [
        ...(input.history ?? []).map((h): ModelMessage => ({ role: h.role, content: h.text })),
        { role: "user", content: input.message },
    ];

    // draining fullStream is what drives the loop: the tools only run as it is consumed
    let thoughts = "";
    let sent = 0;
    const pump = (async () => {
        try {
            const result = await agent.stream({ messages, abortSignal: ctx.signal });
            for await (const part of result.fullStream) {
                if (part.type === "reasoning-delta") {
                    if (!part.text) continue;
                    if (!thoughts) ch.push({ type: "chat.thinking" }); // show up immediately
                    thoughts += part.text;
                    const steps = thinkingSteps(thoughts);
                    for (const label of steps.slice(sent))
                        ch.push({ type: "chat.thinking", label });
                    sent = steps.length;
                } else if (part.type === "text-delta") {
                    if (part.text) ch.push({ type: "chat.text", delta: part.text });
                }
            }
        } catch (e) {
            if (!ctx.signal?.aborted)
                ch.push({
                    type: "chat.text",
                    delta: `\n\n_(I couldn't finish that: ${e instanceof Error ? e.message : "something went wrong"}.)_`,
                });
        } finally {
            ch.close();
        }
    })();

    for await (const ev of ch.drain()) yield ev;
    await pump;
}

// no principal (the eval harness): the body still runs, unmetered, and its patches are kept for the
// card exactly as the executor would keep them
async function unmetered(
    t: AnyTool,
    input: unknown,
    ctx: ToolContext,
    onEvent: (e: TurnEvent) => void,
): Promise<ToolOutcome<unknown>> {
    const patches: Patch[] = [];
    const gen = (t.run as (i: unknown, c: ToolContext) => AsyncGenerator<TurnEvent, unknown>)(
        input,
        ctx,
    );
    let step = await gen.next();
    while (!step.done) {
        if (step.value.type === "patch") patches.push(step.value.patch);
        onEvent(step.value);
        step = await gen.next();
    }
    if (t.patch) {
        const p = t.patch(step.value, input);
        if (!emptyPatch(p)) patches.push(p);
    }
    return { ok: true, result: step.value, patches };
}

implement("ask-assistant", async function* (input, ctx): AsyncGenerator<TurnEvent, void> {
    yield* runChat(input, ctx);
});
