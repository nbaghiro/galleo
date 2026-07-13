import type { Usage } from "./credits";
import { costOf } from "./credits";

// a tool IS the priced unit (usage + optional meter, no usage = free); the run half lives in services/ai/tools

export type ToolId =
    | "generate-artifact"
    | "revise-artifact"
    | "add-section"
    | "rewrite-section"
    | "edit-artifact"
    | "reorder-section"
    | "remove-section"
    | "set-format"
    | "set-theme"
    | "revise-element"
    | "ask-assistant"
    | "rewrite-text"
    | "translate-text"
    | "translate-artifact"
    | "suggest-title"
    | "generate-theme"
    | "generate-image"
    | "write-summary"
    | "write-alt-text"
    | "write-speaker-notes"
    | "suggest-sections"
    | "show-sections"
    | "find-artifacts"
    | "read-artifact"
    | "rename-artifact"
    | "move-artifact"
    | "duplicate-artifact"
    | "trash-artifact"
    | "restore-artifact"
    | "create-folder"
    | "share-artifact"
    | "export-artifact"
    | "find-templates"
    | "find-stock-image"
    | "plan-outline"
    | "plan-section"
    | "write-section"
    | "source-image"
    | "check-section"
    | "pick-arc"
    | "apply-patch";

export type ToolTier = "composite" | "action" | "primitive";

// where a tool is exposed; internal = composition-only (never called directly)
export type ToolSurface = "agent" | "direct" | "mcp" | "internal";

// showcase grouping for the credits table
export type ToolCategory = "create" | "edit" | "text" | "media" | "theme" | "assist";

// knobs a metered tool scales by; all optional
export interface MeterParams {
    length?: string; // "Short" | "Standard" | "In-depth"
    sections?: number;
    images?: number;
    imageSource?: "stock" | "ai"; // stock images are free; AI images metered per image
    textRuns?: number;
    variations?: number;
}

export interface ToolMeta {
    id: ToolId;
    title: string;
    summary: string;
    tier: ToolTier;
    surfaces: ToolSurface[];
    // present on credit-costing tools; absent = free
    category?: ToolCategory;
    usage?: Usage; // typical units → typical cost via costOf()
    meter?: (m: MeterParams) => Usage; // scales cost with the job; absent = fixed-cost
    live?: boolean; // false/undefined = planned (no route yet)
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

// length chip → expected section count
export function sectionsForLength(length?: string): number {
    const l = (length ?? "").toLowerCase();
    if (l.startsWith("short")) return 7;
    if (l.startsWith("in") || l.startsWith("deep") || l.startsWith("long")) return 18;
    return 12;
}

export const TOOL_CATALOG: Record<ToolId, ToolMeta> = {
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
    "plan-outline": meta("plan-outline", "Plan outline", "Plan the arc: title, backdrop, ordered beats", "primitive", INTERNAL), // prettier-ignore
    "plan-section": meta("plan-section", "Plan section", "Decide one section's grid + per-cell blocks", "primitive", INTERNAL), // prettier-ignore
    "write-section": meta("write-section", "Write section", "Write the content that fills a planned grid", "primitive", INTERNAL), // prettier-ignore
    "source-image": meta("source-image", "Source image", "Turn a phrase into a real image url (stock or AI)", "primitive", INTERNAL), // prettier-ignore
    "check-section": meta("check-section", "Check section", "Audit a section for quality issues", "primitive", INTERNAL), // prettier-ignore
    "pick-arc": meta("pick-arc", "Pick arc", "Select the narrative-arc scaffold for a brief", "primitive", INTERNAL), // prettier-ignore
    "apply-patch": meta("apply-patch", "Apply patch", "Commit a proposed patch to the artifact", "action", ["mcp", "direct"]), // prettier-ignore
};

export function toolsFor(surface: ToolSurface): ToolId[] {
    return (Object.keys(TOOL_CATALOG) as ToolId[]).filter((id) =>
        TOOL_CATALOG[id].surfaces.includes(surface),
    );
}

// only tools that are BOTH priced (usage) and live, so no unbuyable prices
export const PRICED_TOOLS: ToolMeta[] = Object.values(TOOL_CATALOG).filter(
    (t) => t.usage && t.live,
);

// the meter if it has one, else base usage
export function estimateUsage(id: ToolId, m: MeterParams = {}): Usage {
    const t = TOOL_CATALOG[id];
    return t.meter ? t.meter(m) : (t.usage ?? {});
}

// what the pre-flight gate reserves + the UI previews
export function estimateCost(id: ToolId, m?: MeterParams): number {
    return costOf(estimateUsage(id, m));
}

// headline cost, ignoring job size
export function typicalCost(id: ToolId): number {
    return costOf(TOOL_CATALOG[id].usage ?? {});
}

export function isMetered(id: ToolId): boolean {
    return !!TOOL_CATALOG[id].meter;
}

// min == max for fixed-cost tools
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
