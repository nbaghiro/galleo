import type { AiActionId } from "./ai";

// The tool catalog — the canonical identities of everything the AI can do, named verb-object so the name
// tells you what it does. This is the PURE half (client-visible, MCP-describable); the executable half —
// each id's `run` — lives in services/ai/tools and binds to these by id. `meterAs` links a tool to the
// pricing action it bills as (see @model/ai AI_ACTIONS), so the registry stays the single source while the
// existing credit metering is untouched.

export type ToolId =
    // composites — whole flows
    | "generate-artifact" // build a whole deck/doc/site from a brief
    | "revise-artifact" // revise the whole piece per an instruction (may restructure)
    | "add-section" // generate a new section + propose inserting it
    | "rewrite-section" // rewrite one existing section in place
    | "revise-element" // rework a single element or cell
    // atomic user-actions — single call
    | "rewrite-text" // rewrite one text run per an instruction
    | "translate-text" // translate one text run
    | "translate-artifact" // translate the whole piece
    | "suggest-title" // propose a title for the artifact
    | "generate-theme" // create a theme from a prompt
    | "generate-image" // create an image with AI
    | "write-summary" // write a summary of the piece
    | "write-alt-text" // write alt text for an image
    | "write-speaker-notes" // write presenter notes for slides
    | "suggest-sections" // propose "what to add next" ideas
    | "show-sections" // display the artifact's existing sections as a carousel
    | "find-stock-image" // search stock libraries for a photo
    // primitives — internal building blocks composites are made of
    | "plan-outline" // plan the arc: title, backdrop, ordered beats
    | "plan-section" // decide one section's grid + per-cell blocks
    | "write-section" // write the content that fills a planned grid
    | "source-image" // turn a phrase into a real url (picks stock vs AI)
    | "check-section" // audit a section for quality issues
    | "pick-arc" // select the narrative-arc scaffold for a brief
    | "apply-patch"; // commit a proposed patch to the artifact

export type ToolTier = "composite" | "action" | "primitive";

// Where a tool is exposed. `internal` = composition-only (never called directly by a user/agent/MCP client).
export type ToolSurface = "agent" | "direct" | "mcp" | "internal";

export interface ToolMeta {
    id: ToolId;
    title: string; // human label
    summary: string; // one line — what it does
    tier: ToolTier;
    surfaces: ToolSurface[];
    meterAs?: AiActionId; // the pricing action this bills as; absent = free / metered via its composite
}

const meta = (
    id: ToolId,
    title: string,
    summary: string,
    tier: ToolTier,
    surfaces: ToolSurface[],
    meterAs?: AiActionId,
): ToolMeta => ({ id, title, summary, tier, surfaces, meterAs });

const AGENT_DIRECT: ToolSurface[] = ["agent", "direct", "mcp"];
const INTERNAL: ToolSurface[] = ["internal"];

export const TOOL_CATALOG: Record<ToolId, ToolMeta> = {
    // composites
    "generate-artifact": meta("generate-artifact", "Generate artifact", "Build a whole deck, doc, or site from a brief", "composite", AGENT_DIRECT, "generate"), // prettier-ignore
    "revise-artifact": meta("revise-artifact", "Revise artifact", "Revise the whole piece per an instruction", "composite", AGENT_DIRECT, "edit"), // prettier-ignore
    "add-section": meta("add-section", "Add section", "Generate a new section and propose inserting it", "composite", AGENT_DIRECT, "continue"), // prettier-ignore
    "rewrite-section": meta("rewrite-section", "Rewrite section", "Rewrite one existing section in place", "composite", AGENT_DIRECT, "regenerate-section"), // prettier-ignore
    "revise-element": meta("revise-element", "Revise element", "Rework a single element or cell", "composite", AGENT_DIRECT, "edit-element"), // prettier-ignore
    // atomic user-actions
    "rewrite-text": meta("rewrite-text", "Rewrite text", "Rewrite one text run per an instruction", "action", AGENT_DIRECT, "rewrite"), // prettier-ignore
    "translate-text": meta("translate-text", "Translate text", "Translate one text run", "action", AGENT_DIRECT, "translate"), // prettier-ignore
    "translate-artifact": meta("translate-artifact", "Translate artifact", "Translate the whole piece", "action", AGENT_DIRECT, "translate-artifact"), // prettier-ignore
    "suggest-title": meta("suggest-title", "Suggest title", "Propose a title for the artifact", "action", AGENT_DIRECT, "retitle"), // prettier-ignore
    "generate-theme": meta("generate-theme", "Generate theme", "Create a theme from a prompt", "action", AGENT_DIRECT, "generate-theme"), // prettier-ignore
    "generate-image": meta("generate-image", "Generate image", "Create an image with AI", "action", AGENT_DIRECT, "generate-image"), // prettier-ignore
    "write-summary": meta("write-summary", "Write summary", "Write a summary of the piece", "action", AGENT_DIRECT, "summarize"), // prettier-ignore
    "write-alt-text": meta("write-alt-text", "Write alt text", "Write alt text for an image", "action", AGENT_DIRECT, "alt-text"), // prettier-ignore
    "write-speaker-notes": meta("write-speaker-notes", "Write speaker notes", "Write presenter notes for slides", "action", AGENT_DIRECT, "speaker-notes"), // prettier-ignore
    "suggest-sections": meta("suggest-sections", "Suggest sections", "Propose what to add next", "action", AGENT_DIRECT), // prettier-ignore
    "show-sections": meta("show-sections", "Show sections", "Display the existing sections as a carousel", "action", ["agent", "direct"]), // prettier-ignore
    "find-stock-image": meta("find-stock-image", "Find stock image", "Search stock libraries for a photo", "action", ["direct", "internal"]), // prettier-ignore
    // primitives
    "plan-outline": meta("plan-outline", "Plan outline", "Plan the arc: title, backdrop, ordered beats", "primitive", INTERNAL), // prettier-ignore
    "plan-section": meta("plan-section", "Plan section", "Decide one section's grid + per-cell blocks", "primitive", INTERNAL), // prettier-ignore
    "write-section": meta("write-section", "Write section", "Write the content that fills a planned grid", "primitive", INTERNAL), // prettier-ignore
    "source-image": meta("source-image", "Source image", "Turn a phrase into a real image url (stock or AI)", "primitive", INTERNAL), // prettier-ignore
    "check-section": meta("check-section", "Check section", "Audit a section for quality issues", "primitive", INTERNAL), // prettier-ignore
    "pick-arc": meta("pick-arc", "Pick arc", "Select the narrative-arc scaffold for a brief", "primitive", INTERNAL), // prettier-ignore
    "apply-patch": meta("apply-patch", "Apply patch", "Commit a proposed patch to the artifact", "action", ["mcp", "direct"]), // prettier-ignore
};

// The ids exposed to a given surface — e.g. the chat agent's toolset = toolsFor("agent").
export function toolsFor(surface: ToolSurface): ToolId[] {
    return (Object.keys(TOOL_CATALOG) as ToolId[]).filter((id) =>
        TOOL_CATALOG[id].surfaces.includes(surface),
    );
}
