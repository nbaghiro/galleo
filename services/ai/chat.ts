import { ToolLoopAgent, stepCountIs, tool } from "ai";
import type { ModelMessage, ToolSet } from "ai";
import { z } from "zod";
import type { ChatBlock, ChatInput, OutlinePatch, TurnEvent } from "@model/ai";
import { estimateUsage } from "@model/tools";
import type { ElementInstance, Section } from "@model/artifact";
import { resolveModel } from "./provider";
import { modelFor, modelNote } from "./models";
import { chatSystem } from "./prompts/chat";
import { thinkingSteps } from "./thinking";
import type { RunOpts } from "./run";
import { makeContext } from "./tools/registry";
import type { Tool } from "./tools/registry";
import { showSectionsTool } from "./tools/inspect";
import { findArtifactsTool, findTemplatesTool, readArtifactTool } from "./tools/library";
import { addSectionTool, editArtifactTool, rewriteSectionTool } from "./tools/section";
import { rewritePassageTool, rewriteTextTool, translateTextTool } from "./tools/text";
import { generateThemeTool } from "./tools/theme";
import { reviseElementTool } from "./tools/element";
import { reimageTool } from "./tools/media";
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
    const override = modelNote(opts.models, ["chat"]);
    if (override) yield { type: "narration", text: "Model override", mono: ` · ${override}` };
    const ch = createChannel<TurnEvent>();
    const format = input.context.content?.format;
    const ctx = makeContext({
        artifact: input.context.content,
        image: opts.image ?? {},
        workspace: opts.workspace,
        signal: opts.signal,
        tier: opts.tier,
        models: opts.models,
        maxSections: opts.maxSections,
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
                } finally {
                    // a tool whose result has nothing to show still has to close its own shell
                    ch.push({
                        type: "chat.tool",
                        blockId: toolCallId,
                        tool: t.id,
                        title,
                        done: true,
                    });
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

    // the outline lives only in the studio, so this proposes ops rather than a content patch
    const reviseOutline = tool({
        description:
            "Revise the OUTLINE of the piece being generated right now: add a beat, remove one, move one, or rewrite what a beat must say. Use this for anything structural or about intent — it is the main way you change a run in progress. Beats not yet written are free to change. Write real substance (claims, numbers, comparisons), never topic labels.",
        inputSchema: z.object({
            summary: z
                .string()
                .describe(
                    "one short line naming the change, e.g. 'Add a pricing beat after proof'",
                ),
            ops: z
                .array(
                    z.object({
                        op: z.enum(["add", "update", "remove", "move"]),
                        id: z
                            .string()
                            .optional()
                            .describe("the beat id to update / remove / move (not used by add)"),
                        afterId: z
                            .string()
                            .nullish()
                            .describe(
                                "for add/move: the beat id this should sit after, or null for the very start",
                            ),
                        label: z.string().optional().describe("the beat's short working title"),
                        role: z
                            .string()
                            .optional()
                            .describe("scene · tension · turn · proof · momentum · close · detail"),
                        brief: z.string().optional().describe("one line naming this section's job"),
                        takeaway: z
                            .string()
                            .optional()
                            .describe("a full sentence: the one thing the reader leaves with"),
                        points: z
                            .array(z.string())
                            .optional()
                            .describe("the 2–4 concrete moves the section makes, in order"),
                        layout: z
                            .string()
                            .optional()
                            .describe("full · split-6040 · split-4060 · two-col · three-up"),
                        image: z.boolean().optional().describe("leads with a full-bleed image"),
                    }),
                )
                .min(1),
        }),
        execute: async (
            revision: {
                summary: string;
                ops: {
                    op: "add" | "update" | "remove" | "move";
                    id?: string;
                    afterId?: string | null;
                    label?: string;
                    role?: string;
                    brief?: string;
                    takeaway?: string;
                    points?: string[];
                    layout?: string;
                    image?: boolean;
                }[];
            },
            { toolCallId }: { toolCallId: string },
        ) => {
            const known = new Set((input.context.generation?.beats ?? []).map((b) => b.id));
            const ops: OutlinePatch = [];
            let added = 0;
            for (const o of revision.ops) {
                const fields = {
                    ...(o.label !== undefined && { label: o.label }),
                    ...(o.role !== undefined && { role: o.role }),
                    ...(o.brief !== undefined && { brief: o.brief }),
                    ...(o.takeaway !== undefined && { takeaway: o.takeaway }),
                    ...(o.points !== undefined && { points: o.points }),
                    ...(o.layout !== undefined && { layout: o.layout }),
                    ...(o.image !== undefined && { image: o.image }),
                };
                if (o.op === "add") {
                    added += 1;
                    ops.push({
                        op: "addBeat",
                        afterId: o.afterId ?? null,
                        // the studio assigns the real id; this one only has to be unique in the batch
                        beat: {
                            id: `new-${added}`,
                            label: o.label ?? "New section",
                            role: o.role ?? "detail",
                            ...fields,
                        },
                    });
                } else if (o.id && known.has(o.id)) {
                    if (o.op === "update") ops.push({ op: "updateBeat", id: o.id, patch: fields });
                    else if (o.op === "remove") ops.push({ op: "removeBeat", id: o.id });
                    else ops.push({ op: "moveBeat", id: o.id, afterId: o.afterId ?? null });
                }
            }
            if (!ops.length)
                return "No usable outline change — the beat ids didn't match the plan.";
            ch.push({
                type: "chat.block",
                blockId: toolCallId,
                block: { type: "outline", summary: revision.summary, ops },
            });
            return `Proposed an outline change: ${revision.summary}. The user applies or discards it.`;
        },
    });

    // The steering note the board used to hold in a text field: one standing instruction applied to
    // every section still to be written. Applied on arrival rather than proposed — it writes nothing
    // and costs nothing, and asking the user to confirm their own instruction reads as a stall.
    const steerSections = tool({
        description:
            "Set the standing note that every section STILL TO BE WRITTEN must follow — tone, angle, emphasis, a constraint to respect. Use it when the user asks for something to hold across the rest of the run ('keep the rest short', 'more concrete numbers from here'), rather than a change to one beat. It does not touch sections already written; rewrite those instead. Pass an empty note to drop the current one.",
        inputSchema: z.object({
            note: z
                .string()
                .describe(
                    "the instruction to hold for the rest of the run; empty string clears it",
                ),
        }),
        execute: async (req: { note: string }, { toolCallId }: { toolCallId: string }) => {
            const note = req.note.trim();
            const had = input.context.generation?.steer?.trim();
            if (!note && !had) return "There was no steering note to clear.";
            ch.push({ type: "chat.block", blockId: toolCallId, block: { type: "steer", note } });
            return note
                ? `Steering every section still to come: “${note}”. It is in force now; sections already written are untouched.`
                : "Cleared the steering note. Sections still to come go back to following the brief alone.";
        },
    });

    const generating = !!input.context.generation;
    const written = !!input.context.content?.sections.length;
    // the client owns the brief, outline, and anchor rules, so this only proposes which beats to
    // build; the studio then runs the same `build` turns the board does
    const writeSections = tool({
        description:
            "Write sections that are ALREADY PLANNED in the outline — the beats listed below that are not yet written. This is how you turn the plan into real content: pass the beat ids (s2, s3, …). Use this whenever the user asks to write, build, generate, or draft sections that exist in the outline. Do NOT use add-section for those — add-section creates a brand-new section beside the plan instead of writing the planned one.",
        inputSchema: z.object({
            beatIds: z
                .array(z.string())
                .min(1)
                .describe("the outline beat ids to write, in the order they should be written"),
            summary: z
                .string()
                .describe("one short line naming what gets written, e.g. 'Write sections 2 to 5'"),
        }),
        execute: async (
            req: { beatIds: string[]; summary: string },
            { toolCallId }: { toolCallId: string },
        ) => {
            const beats = input.context.generation?.beats ?? [];
            const known = new Map(beats.map((b) => [b.id, b]));
            const unknown = req.beatIds.filter((id) => !known.has(id));
            const already = req.beatIds.filter((id) => known.get(id)?.written);
            const todo = req.beatIds.filter((id) => known.get(id) && !known.get(id)!.written);
            if (!todo.length)
                return already.length
                    ? `Those sections are already written (${already.join(", ")}). To change them, use rewrite-section instead.`
                    : `No such beats in the outline (${unknown.join(", ") || "none given"}). The plan's ids are: ${beats.map((b) => b.id).join(", ") || "none yet"}.`;
            ch.push({
                type: "chat.block",
                blockId: toolCallId,
                block: { type: "write", summary: req.summary, beatIds: todo },
            });
            const skipped = [...unknown, ...already];
            return `Offered to write ${todo.length} planned section${todo.length === 1 ? "" : "s"} (${todo.join(", ")})${skipped.length ? `; skipped ${skipped.join(", ")}` : ""}. The user starts it — nothing is written until they do.`;
        },
    });

    // mid-run, "content to act on" means sections actually written: an empty draft would otherwise
    // invite add-section for a beat that is only planned
    const artifactTools: ToolSet = (generating ? written : !!input.context.content)
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
              "revise-element": wrap(
                  reviseElementTool,
                  "Reworking",
                  (section, input) => ({
                      type: "proposal",
                      summary: `Regenerate the ${input.elementType} in “${clip(firstText(section), 30)}”`,
                      patch: [{ op: "replaceSection", id: input.sectionId, section }],
                      preview: section,
                  }),
                  (_section, input) =>
                      `Proposed a fresh ${input.elementType} in ${input.sectionId}; the rest of the section is unchanged.`,
              ),
              reimage: wrap(
                  reimageTool,
                  "Finding a picture",
                  (section, input) => ({
                      type: "proposal",
                      summary:
                          input.target === "backdrop"
                              ? `New backdrop: “${clip(input.phrase, 34)}”`
                              : `New image: “${clip(input.phrase, 34)}”`,
                      patch: [{ op: "replaceSection", id: input.sectionId, section }],
                      preview: section,
                  }),
                  (_section, input) =>
                      `Proposed a new ${input.target === "backdrop" ? "backdrop" : "image"} for ${input.sectionId}.`,
              ),
              "rewrite-passage": wrap(
                  rewritePassageTool,
                  "Rewording",
                  (section, input) => ({
                      type: "proposal",
                      summary: `Reword “${clip(input.find, 40)}”`,
                      patch: [{ op: "replaceSection", id: input.sectionId, section }],
                      preview: section,
                  }),
                  (_section, input) =>
                      `Proposed a reword of that passage in ${input.sectionId}; the rest of the section is untouched.`,
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
              "reorder-section": wrap(
                  reorderSectionTool,
                  "Reordering",
                  (r) => ({ type: "proposal", summary: r.summary, patch: r.patch }),
                  (r) => r.summary,
              ),
              "remove-section": wrap(
                  removeSectionTool,
                  "Removing",
                  (r) => ({ type: "proposal", summary: r.summary, patch: r.patch }),
                  (r) => r.summary,
              ),
              "set-format": wrap(
                  setFormatTool,
                  "Reformatting",
                  (r) => ({ type: "proposal", summary: r.summary, patch: r.patch }),
                  (r) => r.summary,
              ),
              "set-theme": wrap(
                  setThemeTool,
                  "Restyling",
                  (r) => ({ type: "proposal", summary: r.summary, patch: r.patch }),
                  (r) => r.summary,
              ),
          }
        : {};
    // inside a run the piece on the canvas is the whole subject, so library management stands down
    const libraryTools: ToolSet = generating
        ? {}
        : {
              "propose-generation": proposeGeneration,
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
                  (_res, input) =>
                      `Proposed an edit to a section of that artifact (${input.sectionId}).`,
              ),
              "rename-artifact": wrap(
                  renameArtifactTool,
                  "Renaming",
                  (action) => ({ type: "action", action }),
                  () => "Proposed a rename.",
              ),
              "move-artifact": wrap(
                  moveArtifactTool,
                  "Moving",
                  (action) => ({ type: "action", action }),
                  () => "Proposed a move.",
              ),
              "duplicate-artifact": wrap(
                  duplicateArtifactTool,
                  "Duplicating",
                  (action) => ({ type: "action", action }),
                  () => "Proposed a duplicate.",
              ),
              "trash-artifact": wrap(
                  trashArtifactTool,
                  "Trashing",
                  (action) => ({ type: "action", action }),
                  () => "Proposed moving it to Trash — the user confirms before it happens.",
              ),
              "restore-artifact": wrap(
                  restoreArtifactTool,
                  "Restoring",
                  (action) => ({ type: "action", action }),
                  () => "Proposed a restore.",
              ),
              "create-folder": wrap(
                  createFolderTool,
                  "New folder",
                  (action) => ({ type: "action", action }),
                  () => "Proposed a new folder.",
              ),
              "share-artifact": wrap(
                  shareArtifactTool,
                  "Sharing",
                  (action) => ({ type: "action", action }),
                  () => "Opened the share options for the user to publish a link.",
              ),
              "export-artifact": wrap(
                  exportArtifactTool,
                  "Exporting",
                  (action) => ({ type: "action", action }),
                  () => "Opened the artifact for the user to export.",
              ),
          };

    const tools: ToolSet = {
        ...(generating
            ? {
                  "revise-outline": reviseOutline,
                  "write-section": writeSections,
                  "steer-sections": steerSections,
              }
            : {}),
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
        "rewrite-text": wrap(
            rewriteTextTool,
            "Rewording",
            () => null,
            (rewritten) => `Rewritten: ${rewritten}`,
        ),
        "translate-text": wrap(
            translateTextTool,
            "Translating",
            () => null,
            (translated) => `Translated: ${translated}`,
        ),
        "generate-theme": wrap(
            generateThemeTool,
            "Designing a theme",
            (t) => ({
                type: "theme",
                name: t.name,
                mood: t.mood,
                isDark: t.isDark,
                tokens: t.tokens,
            }),
            (t) =>
                `Designed “${t.name}” (${t.mood}, ${t.isDark ? "dark" : "light"}). The user applies it — it isn't saved until they do.`,
        ),
        ...libraryTools,
        ...artifactTools,
    };

    const agent = new ToolLoopAgent({
        model: resolveModel(modelFor("chat", opts.tier, opts.models)),
        instructions: chatSystem(input.context),
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
            const result = await agent.stream({ messages, abortSignal: opts.signal });
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
