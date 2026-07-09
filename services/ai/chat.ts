import { ToolLoopAgent, stepCountIs, tool } from "ai";
import type { ModelMessage } from "ai";
import type { ChatBlock, ChatInput, TurnEvent } from "@model/ai";
import type { ElementInstance, Section } from "@model/artifact";
import { resolveModel } from "./provider";
import { defaultModelFor } from "./models";
import { chatSystem } from "./prompts/chat";
import type { RunOpts } from "./run";
import { makeContext } from "./tools/registry";
import type { Tool } from "./tools/registry";
import { showSectionsTool } from "./tools/inspect";
import { addSectionTool, rewriteSectionTool } from "./tools/section";
import { suggestSectionsTool } from "./tools/suggest";

// The chat agent — a real multi-step tool-calling loop (AI SDK ToolLoopAgent) whose toolset is BUILT FROM THE
// REGISTRY (services/ai/tools). The model answers in text and calls tools; each tool's capability lives in the
// registry (shared with the direct + MCP surfaces), and chat only owns PRESENTATION — turning a tool's typed
// result into a rich block (a proposal with a real section preview, a suggestion set, a section carousel). The
// approval gate stays the client's Apply/Discard on each proposal: the artifact lives client-side, so the
// agent only ever proposes — nothing is applied until the user says so.
//
// Unlike the CONTENT tools (which run fast + thinkless), the AGENT itself reasons — it picks and chains tools,
// interprets nuanced asks — so it runs on a stronger model (see DEFAULT_MODELS.chat) with thinking ENABLED
// (no thinkingBudget override here). The content tools keep their own fast, thinkless models internally.

// A tiny async channel — tools push TurnEvents into it as they run; runChat drains it while the loop
// executes, so a long multi-tool turn streams progress instead of arriving all at once at the end.
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

// The first non-empty text in a section — a human label for a proposal summary.
function firstText(section: Section): string {
    const visit = (el: ElementInstance | undefined): string => {
        if (!el) return "";
        const d = el.data as { text?: string; children?: ElementInstance[] };
        if (typeof d.text === "string" && d.text.trim()) return d.text.trim();
        for (const k of d.children ?? []) {
            const t = visit(k);
            if (t) return t;
        }
        return "";
    };
    for (const cell of Object.values(section.cells)) {
        const t = visit(cell.element);
        if (t) return t;
    }
    return "section";
}
const clip = (s: string, n: number): string =>
    s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;

export async function* runChat(input: ChatInput, opts: RunOpts = {}): AsyncGenerator<TurnEvent> {
    yield { type: "turn.start", kind: "chat" };
    const ch = createChannel<TurnEvent>();
    const format = input.context.content?.format;
    const ctx = makeContext({
        artifact: input.context.content,
        image: opts.image ?? {},
        signal: opts.signal,
    });

    // Wrap a registry tool as an AI SDK tool: run it (forwarding its progress as nested events), then PRESENT
    // its typed result as a chat block. `present`/`note` are the only chat-specific bits; the capability is
    // the registry tool, shared with every other surface.
    const wrap = <I, R>(
        t: Tool<I, R>,
        title: string,
        present: (result: R, input: I) => ChatBlock | null,
        note: (result: R, input: I) => string,
    ) =>
        tool({
            description: t.describe,
            inputSchema: t.input,
            execute: async (input: I, { toolCallId }: { toolCallId: string }) => {
                ch.push({ type: "chat.tool", blockId: toolCallId, tool: t.id, title });
                try {
                    const gen = t.run(input, ctx);
                    let step = await gen.next();
                    while (!step.done) {
                        ch.push({ type: "chat.nested", blockId: toolCallId, event: step.value });
                        step = await gen.next();
                    }
                    const block = present(step.value, input);
                    if (block) ch.push({ type: "chat.block", blockId: toolCallId, block });
                    return note(step.value, input);
                } catch (e) {
                    ch.push({
                        type: "chat.text",
                        delta: `\n\n_(That didn't work: ${e instanceof Error ? e.message : "error"}.)_`,
                    });
                    return "That action failed.";
                }
            },
        });

    // The toolset is artifact-scoped, so it's only wired when an artifact is OPEN. In the library (no open
    // document) the agent runs tool-less — purely conversational (plan / getting-started help) — which is why
    // it never tries add-section on nothing. The system prompt (chatSystem) matches this per surface.
    const tools = input.context.content
        ? {
              "suggest-sections": wrap(
                  suggestSectionsTool,
                  "Ideas",
                  (items) => ({ type: "suggestions", items }),
                  (items) => `Offered ${items.length} section ideas.`,
              ),
              "add-section": wrap(
                  addSectionTool,
                  "New section",
                  (section, input) => ({
                      type: "proposal",
                      summary: `Add a “${clip(firstText(section), 40)}” section`,
                      patch: [{ op: "addSection", afterId: input.afterId, section }],
                      preview: section,
                  }),
                  (section, input) =>
                      `Proposed a new “${firstText(section)}” section${input.afterId ? ` after ${input.afterId}` : ""}.`,
              ),
              "rewrite-section": wrap(
                  rewriteSectionTool,
                  "Edit section",
                  (section, input) => ({
                      type: "proposal",
                      summary: `Rewrite the “${clip(firstText(section), 40)}” section`,
                      patch: [{ op: "replaceSection", id: input.sectionId, section }],
                      preview: section,
                  }),
                  (_section, input) => `Proposed a rewrite of section ${input.sectionId}.`,
              ),
              "show-sections": wrap(
                  showSectionsTool,
                  "Sections",
                  (sections) => (sections.length ? { type: "sections", sections, format } : null),
                  (sections) =>
                      sections.length
                          ? `Showing ${sections.length} section${sections.length === 1 ? "" : "s"}.`
                          : "There are no sections to show yet.",
              ),
          }
        : undefined;

    const agent = new ToolLoopAgent({
        model: resolveModel(defaultModelFor("chat")),
        instructions: chatSystem(input.context),
        tools,
        stopWhen: stepCountIs(6),
    });

    const messages: ModelMessage[] = [
        ...(input.history ?? []).map((h): ModelMessage => ({ role: h.role, content: h.text })),
        { role: "user", content: input.message },
    ];

    // Run the loop and stream its output concurrently: the tools push their blocks as they execute (a
    // working-shell, then the finished proposal), while the model's prose streams token-by-token off
    // textStream. Draining textStream is also what DRIVES the loop (executes the tools), so consuming it
    // fully is what makes the whole turn run. Then the channel closes and the drain (and turn) end.
    const pump = (async () => {
        try {
            const result = await agent.stream({ messages, abortSignal: opts.signal });
            for await (const delta of result.textStream) {
                if (delta) ch.push({ type: "chat.text", delta });
            }
        } catch (e) {
            if (!opts.signal?.aborted)
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
    yield { type: "turn.done" };
}
