import type { Usage } from "./credits";
import { costOf } from "./credits";

// The tool catalog — the ONE canonical catalog of everything the AI can do, named verb-object so the name
// tells you what it does. This is the PURE half (client-visible, MCP-describable); the executable half —
// each id's `run` — lives in services/ai/tools and binds to these by id. Each tool carries its OWN pricing
// (`usage` + an optional `meter`) — there is no separate "AI actions" catalog; a tool IS the priced unit,
// and the credit gate + pricing page read straight off this. Tools with no `usage` are free (reads, internal
// primitives). Pricing rides the generic metered engine in @model/credits: a tool declares its units of work
// and the cost is `costOf(usage)`, so a long artifact costs more than a short one without special-casing.

export type ToolId =
    // composites — whole flows
    | "generate-artifact" // build a whole deck/doc/site from a brief
    | "revise-artifact" // revise the whole piece per an instruction (may restructure)
    | "add-section" // generate a new section + propose inserting it
    | "rewrite-section" // rewrite one existing section in place
    | "edit-artifact" // edit a section of another (not-open) library artifact in place
    | "reorder-section" // move a section to a new position
    | "remove-section" // delete a section
    | "set-format" // re-render the artifact as deck / doc / web
    | "set-theme" // switch the artifact to a built-in theme
    | "revise-element" // rework a single element or cell
    | "ask-assistant" // the conversational assistant turn (reasons + picks + chains the tools below)
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
    | "find-artifacts" // search the user's library by title/topic
    | "read-artifact" // load one artifact's content, to summarize or edit it
    | "rename-artifact" // rename an artifact
    | "move-artifact" // move an artifact into a folder (or out)
    | "duplicate-artifact" // copy an artifact
    | "trash-artifact" // move an artifact to Trash (confirmed)
    | "restore-artifact" // restore an artifact from Trash
    | "create-folder" // make a new folder
    | "share-artifact" // open the share options for an artifact (publish is opt-in there)
    | "export-artifact" // open an artifact to export it
    | "find-templates" // list the starter templates
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

// The showcase grouping for the "what your credits buy" table (priced tools only).
export type ToolCategory = "create" | "edit" | "text" | "media" | "theme" | "assist";

// The knobs a metered tool scales by. All optional; a meter reads the ones it cares about and falls back to a
// sensible default (so an estimate works before exact counts are known).
export interface MeterParams {
    length?: string; // "Short" | "Standard" | "In-depth" — the intake length chip (generate-artifact)
    sections?: number; // sections to write / reason over (generate-artifact, revise-artifact, add-section)
    images?: number; // images generated within a generation
    imageSource?: "stock" | "ai"; // generate-artifact: stock images are free; AI images are metered per image
    textRuns?: number; // text elements to translate (translate-artifact)
    variations?: number; // image variations (generate-image)
}

export interface ToolMeta {
    id: ToolId;
    title: string; // human label (shown in the pricing table + UI)
    summary: string; // one line — what it does
    tier: ToolTier;
    surfaces: ToolSurface[];
    // Pricing — present on user-facing, credit-costing tools; absent = free (reads, internal primitives).
    category?: ToolCategory;
    usage?: Usage; // the typical units this tool does → its typical credit cost via costOf()
    meter?: (m: MeterParams) => Usage; // cost that scales with the job; absent = fixed-cost (base `usage`)
    live?: boolean; // a prompt builder (+ route) exists; false/undefined = planned
}

type Pricing = Pick<ToolMeta, "category" | "usage" | "meter" | "live">;

const meta = (
    id: ToolId,
    title: string,
    summary: string,
    tier: ToolTier,
    surfaces: ToolSurface[],
    pricing?: Pricing,
): ToolMeta => ({ id, title, summary, tier, surfaces, ...pricing });

const AGENT_DIRECT: ToolSurface[] = ["agent", "direct", "mcp"];
const INTERNAL: ToolSurface[] = ["internal"];

// The intake length chip → an expected section count (the demos run ~18; templates ~12; a short deck ~7).
export function sectionsForLength(length?: string): number {
    const l = (length ?? "").toLowerCase();
    if (l.startsWith("short")) return 7;
    if (l.startsWith("in") || l.startsWith("deep") || l.startsWith("long")) return 18;
    return 12;
}

export const TOOL_CATALOG: Record<ToolId, ToolMeta> = {
    // composites
    "generate-artifact": meta("generate-artifact", "Generate artifact", "Build a whole deck, doc, or site from a brief", "composite", AGENT_DIRECT, { category: "create", live: true, usage: { plan: 1, section: 12, image: 3 }, meter: (m) => { const n = m.sections ?? sectionsForLength(m.length); return { plan: 1, section: n, image: m.imageSource === "ai" ? (m.images ?? Math.ceil(n / 4)) : 0 }; } }), // prettier-ignore
    "revise-artifact": meta("revise-artifact", "Revise artifact", "Revise the whole piece per an instruction", "composite", AGENT_DIRECT, { category: "edit", usage: { section: 10 }, meter: (m) => ({ section: Math.max(3, m.sections ?? 10) }) }), // prettier-ignore
    "add-section": meta("add-section", "Add section", "Generate a new section and propose inserting it", "composite", AGENT_DIRECT, { category: "create", live: true, usage: { section: 1 } }), // prettier-ignore
    "rewrite-section": meta("rewrite-section", "Rewrite section", "Rewrite one existing section in place", "composite", AGENT_DIRECT, { category: "edit", live: true, usage: { section: 1 } }), // prettier-ignore
    "edit-artifact": meta("edit-artifact", "Edit artifact", "Edit a section of another library artifact in place", "composite", ["agent", "direct"], { category: "edit", live: true, usage: { section: 1 } }), // prettier-ignore
    "reorder-section": meta("reorder-section", "Reorder section", "Move a section to a new position", "action", ["agent", "direct"]), // prettier-ignore
    "remove-section": meta("remove-section", "Remove section", "Delete a section", "action", ["agent", "direct"]), // prettier-ignore
    "set-format": meta("set-format", "Set format", "Re-render as deck / doc / web", "action", ["agent", "direct"]), // prettier-ignore
    "set-theme": meta("set-theme", "Set theme", "Switch the artifact to a built-in theme", "action", ["agent", "direct"]), // prettier-ignore
    "revise-element": meta("revise-element", "Revise element", "Rework a single element or cell", "composite", AGENT_DIRECT, { category: "edit", live: true, usage: { text: 2 } }), // prettier-ignore
    "ask-assistant": meta("ask-assistant", "Ask the assistant", "A conversational agent turn — reasons over your artifact and chains the tools above", "composite", ["direct"], { category: "assist", live: true, usage: { reply: 1 } }), // prettier-ignore
    // atomic user-actions
    "rewrite-text": meta("rewrite-text", "Rewrite text", "Rewrite one text run per an instruction", "action", AGENT_DIRECT, { category: "text", live: true, usage: { text: 1 } }), // prettier-ignore
    "translate-text": meta("translate-text", "Translate text", "Translate one text run", "action", AGENT_DIRECT, { category: "text", live: true, usage: { text: 1 } }), // prettier-ignore
    "translate-artifact": meta("translate-artifact", "Translate artifact", "Translate the whole piece", "action", AGENT_DIRECT, { category: "text", usage: { text: 12 }, meter: (m) => ({ text: Math.max(1, m.textRuns ?? 12) }) }), // prettier-ignore
    "suggest-title": meta("suggest-title", "Suggest title", "Propose a title for the artifact", "action", AGENT_DIRECT, { category: "assist", usage: { text: 1 } }), // prettier-ignore
    "generate-theme": meta("generate-theme", "Generate theme", "Create a theme from a prompt", "action", AGENT_DIRECT, { category: "theme", live: true, usage: { theme: 1 } }), // prettier-ignore
    "generate-image": meta("generate-image", "Generate image", "Create an image with AI", "action", AGENT_DIRECT, { category: "media", live: true, usage: { image: 1 }, meter: (m) => ({ image: Math.max(1, m.variations ?? 1) }) }), // prettier-ignore
    "write-summary": meta("write-summary", "Write summary", "Write a summary of the piece", "action", AGENT_DIRECT, { category: "assist", usage: { reply: 1 } }), // prettier-ignore
    "write-alt-text": meta("write-alt-text", "Write alt text", "Write alt text for an image", "action", AGENT_DIRECT, { category: "assist", usage: { text: 1 } }), // prettier-ignore
    "write-speaker-notes": meta("write-speaker-notes", "Write speaker notes", "Write presenter notes for slides", "action", AGENT_DIRECT, { category: "assist", usage: { reply: 1 } }), // prettier-ignore
    "suggest-sections": meta("suggest-sections", "Suggest sections", "Propose what to add next", "action", AGENT_DIRECT), // prettier-ignore
    "show-sections": meta("show-sections", "Show sections", "Display the existing sections as a carousel", "action", ["agent", "direct"]), // prettier-ignore
    "find-artifacts": meta("find-artifacts", "Find artifacts", "Search the user's library by title or topic", "action", ["agent", "direct"]), // prettier-ignore
    "read-artifact": meta("read-artifact", "Read artifact", "Load one artifact's content to summarize or edit it", "action", ["agent", "direct"]), // prettier-ignore
    "rename-artifact": meta("rename-artifact", "Rename artifact", "Rename an artifact", "action", ["agent", "direct"]), // prettier-ignore
    "move-artifact": meta("move-artifact", "Move artifact", "Move an artifact into a folder (or out)", "action", ["agent", "direct"]), // prettier-ignore
    "duplicate-artifact": meta("duplicate-artifact", "Duplicate artifact", "Make a copy of an artifact", "action", ["agent", "direct"]), // prettier-ignore
    "trash-artifact": meta("trash-artifact", "Trash artifact", "Move an artifact to Trash", "action", ["agent", "direct"]), // prettier-ignore
    "restore-artifact": meta("restore-artifact", "Restore artifact", "Restore an artifact from Trash", "action", ["agent", "direct"]), // prettier-ignore
    "create-folder": meta("create-folder", "Create folder", "Make a new folder", "action", ["agent", "direct"]), // prettier-ignore
    "share-artifact": meta("share-artifact", "Share artifact", "Open the share options for an artifact", "action", ["agent", "direct"]), // prettier-ignore
    "export-artifact": meta("export-artifact", "Export artifact", "Open an artifact to export it", "action", ["agent", "direct"]), // prettier-ignore
    "find-templates": meta("find-templates", "Find templates", "List the starter templates", "action", ["agent", "direct"]), // prettier-ignore
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

// The priced, user-facing tools — the "what your credits buy" showcase reads this (in catalog order). Only
// tools that are BOTH priced (`usage`) and actually shipped (`live`) belong here — never advertise a price
// for a capability a user can't yet invoke. Planned-but-unbuilt tools stay in the catalog (with their pricing
// ready) but drop off the showcase until they go live.
export const PRICED_TOOLS: ToolMeta[] = Object.values(TOOL_CATALOG).filter(
    (t) => t.usage && t.live,
);

// ---- pricing (the credit math, keyed by ToolId — replaces the old AI-actions pricing) ----

// The real expected usage for a tool given the job's size — the meter if it has one, else its base usage.
export function estimateUsage(id: ToolId, m: MeterParams = {}): Usage {
    const t = TOOL_CATALOG[id];
    return t.meter ? t.meter(m) : (t.usage ?? {});
}

// The estimated credit cost (what the pre-flight gate reserves and the UI previews).
export function estimateCost(id: ToolId, m?: MeterParams): number {
    return costOf(estimateUsage(id, m));
}

// The typical (headline) cost, ignoring job size — for a compact showcase number.
export function typicalCost(id: ToolId): number {
    return costOf(TOOL_CATALOG[id].usage ?? {});
}

// Whether a tool's cost scales with the job (so the UI can show a range, not a single number).
export function isMetered(id: ToolId): boolean {
    return !!TOOL_CATALOG[id].meter;
}

// The cost range a metered tool spans (a small job → a large one); min == max for fixed-cost tools.
const SMALL: MeterParams = {
    length: "Short",
    sections: 6,
    textRuns: 5,
    images: 2,
    variations: 1,
    imageSource: "stock",
};
const LARGE: MeterParams = {
    length: "In-depth",
    sections: 20,
    textRuns: 40,
    images: 6,
    variations: 4,
    imageSource: "ai",
};
export function costRange(id: ToolId): { min: number; max: number } {
    const t = TOOL_CATALOG[id];
    if (!t.meter) {
        const c = typicalCost(id);
        return { min: c, max: c };
    }
    return { min: costOf(t.meter(SMALL)), max: costOf(t.meter(LARGE)) };
}
