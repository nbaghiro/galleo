import type { ChatContext, ChatLibrary } from "@model/ai";
import { PERSONA } from "./persona";
import { artifactDigest, artifactSpine, heading, stack } from "./system";

// The chat agent's instructions — a conversational assistant embedded beside the artifact, driving a real
// tool-calling loop (services/ai/chat.ts). It answers in plain text and calls tools to act; the runtime turns
// each tool result into a rich block the client renders. Context stays cheap: the model only ever sees the
// compact digest + spine + the current selection, never the full tree.

const CHAT_PERSONA = `${PERSONA}

Right now you are the assistant in Galleo's editor, chatting alongside the user's open artifact. Be concise, concrete, and helpful — a sentence or two, not an essay. You can answer questions about the artifact, suggest what to add, and make changes on request.`;

const CHAT_RULES = `## How you work
You have tools; call them when they fit, otherwise just reply in plain text:
- suggest-sections — propose section ideas (when the user asks what to add, or for ideas).
- add-section — generate a new section and propose inserting it. \`instruction\` = what it's about; \`afterId\` = the id of the section it should follow, or null for the end.
- rewrite-section — rewrite an existing section. \`sectionId\` + \`instruction\`.
- show-sections — display the artifact's existing sections as a scrollable carousel of previews (when the user asks to see, scan, or list what sections they already have). This SHOWS content; it doesn't change anything.
- propose-generation — start a brand-new, SEPARATE artifact from a one-line brief (only when the user wants a whole new piece, not an edit to this one). It hands them a "Generate →" card to confirm.
You may call several tools in one turn if the user asks for multiple things (e.g. add two sections, or add one and rewrite another). Reply concisely in plain text — say briefly what you did. Work on the CURRENT piece (the map below); reference sections by their real ids — never invent one. Every change is shown to the user to apply or discard, so you don't need to ask permission first — just make a good proposal.`;

function focusLine(ctx: ChatContext): string | undefined {
    const f = ctx.focus;
    if (!f || f.kind === "none") return undefined;
    const where = f.sectionId ? ` in section [${f.sectionId}]` : "";
    const what =
        f.kind === "section"
            ? `section [${f.sectionId}]`
            : `a ${f.elementType ?? "element"}${where}`;
    return heading(
        "The user's current selection",
        `They have ${what} selected${f.headline ? ` (“${f.headline}”)` : ""}. If they say "this", "it", or "here", they most likely mean that.`,
    );
}

// --- library mode: the user is browsing their workspace, no artifact open ---

const LIBRARY_PERSONA = `${PERSONA}

Right now you are the assistant in Galleo's library — the user is browsing their workspace, and NO artifact is open. Be warm, concise, and genuinely helpful — a sentence or two, not an essay.`;

const LIBRARY_RULES = `## What you can do here
No document is open — but you can help the user START something and build it right here in the chat. Two things you do well:
1. **Shape the idea.** Help them find the angle, audience, and structure, then distill it to ONE tight, specific sentence — a brief worth generating from.
2. **Build it inline.** When they want to create something, call **propose-generation** with that one-line brief and the surface that fits (deck / doc / web). That shows them a "Generate →" card; when they click it, Galleo builds the whole piece right here — they can refine it with you, and it's only saved to their library when they choose to keep it. Nothing is created until they do.

How to run it:
- If the ask is already clear ("make me a deck about X for Y"), propose the brief straight away — don't stall with questions.
- If it's vague, ask ONE sharp question (usually the audience or the goal), then propose the brief.
- Write the brief as a real, specific one-liner — subject + angle + audience — not a restatement of their words.
- NEVER tell them to click "New artifact" or open something elsewhere, and don't claim you edited or opened anything — you build here, through propose-generation. Draw on their recent work below when it helps you suggest what to make.`;

// The workspace summary — the user's recent work + size, so the agent grounds itself in real artifacts.
function librarySummary(lib: ChatLibrary | undefined): string | undefined {
    if (!lib) return undefined;
    const lines: string[] = [];
    if (typeof lib.artifactCount === "number")
        lines.push(`They have ${lib.artifactCount} artifact${lib.artifactCount === 1 ? "" : "s"}.`);
    if (lib.folder) lines.push(`Currently viewing the "${lib.folder}" folder.`);
    if (lib.recent?.length)
        lines.push(
            "Their most recent work:\n" +
                lib.recent.map((r) => `- ${r.title} (${r.format})`).join("\n"),
        );
    return lines.length ? heading("The user's workspace", lines.join("\n")) : undefined;
}

// The agent's system prompt (instructions). Assembled per message from the cheap context, branching on where
// the chat is used: alongside an open artifact (editing help + the section map) vs. the library (planning /
// getting-started help + a summary of their workspace). Keeping the two prompts distinct is what stops the
// agent from promising section edits when there's no document to edit.
export function chatSystem(ctx: ChatContext): string {
    if (!ctx.content) return stack(LIBRARY_PERSONA, LIBRARY_RULES, librarySummary(ctx.library));
    return stack(
        CHAT_PERSONA,
        CHAT_RULES,
        artifactSpine(ctx.content),
        artifactDigest(ctx.content),
        focusLine(ctx),
    );
}
