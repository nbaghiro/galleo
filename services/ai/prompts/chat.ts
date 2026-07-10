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
You may call several tools in one turn if the user asks for multiple things (e.g. add two sections, or add one and rewrite another). Reply concisely in plain text — say briefly what you did. Only act on the OPEN artifact; if none is open, say so and don't call a tool. Reference sections by the real ids in the map below — never invent one. Every change is shown to the user to apply or discard, so you don't need to ask permission first — just make a good proposal.`;

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
There's no open document, so you can't edit sections or elements right now — don't claim you added, changed, or opened anything, because you can't from here. What you CAN do:
- Help the user think through and shape a NEW piece — its angle, audience, structure, and a tight one-line brief they can generate from.
- Suggest what to make or explore next, drawing on their existing work below when it's relevant.
- Answer questions about Galleo and how to get things done.
To actually create something, they click "New artifact" (or start from a Template) — they can paste in a brief you helped them write. To edit an existing piece, they open it from the library and chat with me there. If they ask you to build or change a specific artifact, help them get set up and tell them how to kick it off, rather than pretending to do it.`;

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
