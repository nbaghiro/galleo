import { ToolLoopAgent, stepCountIs, tool } from "ai";
import type { ModelMessage, ToolSet } from "ai";
import { z } from "zod";
import type { ChatBlock, ChatInput, TurnEvent } from "@model/ai";
import { estimateUsage } from "@model/tools";
import type { ElementInstance, Section } from "@model/artifact";
import { resolveModel } from "./provider";
import { defaultModelFor } from "./models";
import { chatSystem } from "./prompts/chat";
import type { RunOpts } from "./run";
import { makeContext } from "./tools/registry";
import type { Tool } from "./tools/registry";
import { showSectionsTool } from "./tools/inspect";
import { findArtifactsTool, findTemplatesTool, readArtifactTool } from "./tools/library";
import { addSectionTool, editArtifactTool, rewriteSectionTool } from "./tools/section";
import {
    createFolderTool,
    duplicateArtifactTool,
    exportArtifactTool,
    moveArtifactTool,
    renameArtifactTool,
    restoreArtifactTool,
    shareArtifactTool,
    trashArtifactTool,
} from "./tools/manage";
import {
    removeSectionTool,
    reorderSectionTool,
    setFormatTool,
    setThemeTool,
} from "./tools/structure";
import { suggestSectionsTool } from "./tools/suggest";

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
    return visit(section.root) || "section";
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
        workspace: opts.workspace,
        signal: opts.signal,
    });

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
                    // bill real sub-tool work; free tools declare no usage (no-op); route reconciles from the sum
                    const usage = estimateUsage(t.id);
                    if (Object.keys(usage).length) opts.onUsage?.(usage);
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

    const proposeGeneration = tool({
        description:
            "Propose building a whole NEW artifact (deck, doc, or site) from a one-line brief. This does NOT build it — it shows the user a confirm card with the brief; they click Generate to build it right here. Reach for this the moment the user wants to CREATE something new (there's no open document to edit). Distill the conversation to ONE tight, specific sentence — subject, angle, and audience — and pick the surface that fits.",
        inputSchema: z.object({
            prompt: z
                .string()
                .describe(
                    "the one-sentence brief the generator builds from — subject + angle + audience in a single line",
                ),
            surface: z
                .enum(["deck", "doc", "web"])
                .describe("deck (slides), doc (a written document), or web (a landing page)"),
            length: z
                .enum(["Short", "Standard", "In-depth"])
                .optional()
                .describe("how long it should be — defaults to Standard"),
            sourceFromMessage: z
                .boolean()
                .optional()
                .describe(
                    "set true to build FROM the content the user just pasted in their message (turn THIS into a deck) — don't re-type their text into the prompt",
                ),
            sourceArtifactId: z
                .string()
                .optional()
                .describe(
                    "to repurpose an existing artifact into a new format (e.g. 'turn my report into a deck'), its id from find-artifacts",
                ),
        }),
        execute: async (
            brief: {
                prompt: string;
                surface: "deck" | "doc" | "web";
                length?: string;
                sourceFromMessage?: boolean;
                sourceArtifactId?: string;
            },
            { toolCallId }: { toolCallId: string },
        ) => {
            ch.push({ type: "chat.block", blockId: toolCallId, block: { type: "brief", brief } });
            return `Proposed a ${brief.surface} to generate. The user can review the brief and click Generate to build it here — nothing is created until they do.`;
        },
    });

    // artifact-scoped tools only when there's content (an open artifact or in-chat draft)
    const artifactTools: ToolSet = input.context.content
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
              "reorder-section": wrap(reorderSectionTool, "Reordering", (r) => ({ type: "proposal", summary: r.summary, patch: r.patch }), (r) => r.summary), // prettier-ignore
              "remove-section": wrap(removeSectionTool, "Removing", (r) => ({ type: "proposal", summary: r.summary, patch: r.patch }), (r) => r.summary), // prettier-ignore
              "set-format": wrap(setFormatTool, "Reformatting", (r) => ({ type: "proposal", summary: r.summary, patch: r.patch }), (r) => r.summary), // prettier-ignore
              "set-theme": wrap(setThemeTool, "Restyling", (r) => ({ type: "proposal", summary: r.summary, patch: r.patch }), (r) => r.summary), // prettier-ignore
          }
        : {};
    const tools: ToolSet = {
        "propose-generation": proposeGeneration,
        "find-artifacts": wrap(
            findArtifactsTool,
            "Searching your library",
            (items) => (items.length ? { type: "artifacts", items } : null),
            // note is the model's tool result — MUST carry ids so a follow-up read/edit targets the right one
            (items) =>
                items.length
                    ? `Found ${items.length}:\n${items.map((i) => `- ${i.id} — “${i.title}” (${i.format})`).join("\n")}`
                    : "No matching artifacts in the library.",
        ),
        "read-artifact": wrap(
            readArtifactTool,
            "Reading",
            () => null,
            (digest) => digest,
        ),
        "find-templates": wrap(
            findTemplatesTool,
            "Browsing templates",
            (items) => (items.length ? { type: "templates", items } : null),
            (items) =>
                items.length
                    ? `Templates: ${items.map((t) => `${t.name} (${t.category})`).join(", ")}. The user can pick one to start from.`
                    : "No matching templates.",
        ),
        "edit-artifact": wrap(
            editArtifactTool,
            "Editing",
            (res, input) => ({
                type: "proposal",
                summary: `Update “${clip(firstText(res.section), 40)}”`,
                patch: [{ op: "replaceSection", id: input.sectionId, section: res.section }],
                preview: res.section,
                targetArtifactId: res.artifactId,
                theme: res.theme,
                format: res.format,
            }),
            (_res, input) => `Proposed an edit to a section of that artifact (${input.sectionId}).`,
        ),
        "rename-artifact": wrap(renameArtifactTool, "Renaming", (action) => ({ type: "action", action }), () => "Proposed a rename."), // prettier-ignore
        "move-artifact": wrap(moveArtifactTool, "Moving", (action) => ({ type: "action", action }), () => "Proposed a move."), // prettier-ignore
        "duplicate-artifact": wrap(duplicateArtifactTool, "Duplicating", (action) => ({ type: "action", action }), () => "Proposed a duplicate."), // prettier-ignore
        "trash-artifact": wrap(trashArtifactTool, "Trashing", (action) => ({ type: "action", action }), () => "Proposed moving it to Trash — the user confirms before it happens."), // prettier-ignore
        "restore-artifact": wrap(restoreArtifactTool, "Restoring", (action) => ({ type: "action", action }), () => "Proposed a restore."), // prettier-ignore
        "create-folder": wrap(createFolderTool, "New folder", (action) => ({ type: "action", action }), () => "Proposed a new folder."), // prettier-ignore
        "share-artifact": wrap(shareArtifactTool, "Sharing", (action) => ({ type: "action", action }), () => "Opened the share options for the user to publish a link."), // prettier-ignore
        "export-artifact": wrap(exportArtifactTool, "Exporting", (action) => ({ type: "action", action }), () => "Opened the artifact for the user to export."), // prettier-ignore
        ...artifactTools,
    };

    const agent = new ToolLoopAgent({
        model: resolveModel(opts.model ?? defaultModelFor("chat")),
        instructions: chatSystem(input.context),
        tools,
        stopWhen: stepCountIs(6),
        // return Gemini's thinking summaries in the stream (thinking stays on); client shows them as a progress bubble
        providerOptions: { google: { thinkingConfig: { includeThoughts: true } } },
    });

    const messages: ModelMessage[] = [
        ...(input.history ?? []).map((h): ModelMessage => ({ role: h.role, content: h.text })),
        { role: "user", content: input.message },
    ];

    // draining fullStream is what DRIVES the loop (executes the tools) — consuming it fully runs the whole turn
    const pump = (async () => {
        try {
            const result = await agent.stream({ messages, abortSignal: opts.signal });
            for await (const part of result.fullStream) {
                if (part.type === "reasoning-delta") {
                    if (part.text) ch.push({ type: "chat.reasoning", delta: part.text });
                } else if (part.type === "text-delta") {
                    if (part.text) ch.push({ type: "chat.text", delta: part.text });
                }
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
