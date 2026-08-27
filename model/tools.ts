import { z } from "zod";
import type { ZodType } from "zod";
// Every tool Galleo can run, defined once. A definition carries what the tool is (title, summary),
// what the agent is told about it (`describe`), where it is exposed (`surfaces`), and what it costs
// (`usage`/`meter`, absent = free). The run half lives in services/core/ai/tools.ts, which refuses
// to register a body whose id has no definition here.
//
// Input schemas sit in TOOL_INPUT rather than on the definitions, so a client importing this module
// for a cost estimate tree-shakes zod and all the schemas out of its bundle.

import type { TurnKind } from "./ai";
import type { Features } from "./billing";
import type { UnitRates, Usage } from "./credits";
import { costOf } from "./credits";

// Which priced tool each turn kind bills as. Here rather than in services because the browser needs
// it too: a turn that dies mid-stream is reported client-side and has to name the same tool the
// server's own failure event does.
export const ACTION_FOR: Record<TurnKind, ToolId> = {
    generate: "generate-artifact",
    edit: "revise-artifact",
    section: "add-section",
    chat: "ask-assistant",
    plan: "plan-outline",
    build: "add-section",
};

export type ToolId =
    | "generate-artifact"
    | "revise-artifact"
    | "add-section"
    | "rewrite-section"
    | "suggest-section-layouts"
    | "edit-artifact"
    | "reorder-section"
    | "remove-section"
    | "set-format"
    | "set-theme"
    | "revise-element"
    | "ask-assistant"
    | "rewrite-text"
    | "refine-prompt"
    | "rewrite-passage"
    | "translate-text"
    | "translate-artifact"
    | "suggest-title"
    | "generate-theme"
    | "generate-image"
    | "generate-video"
    | "reimage"
    | "write-summary"
    | "write-alt-text"
    | "write-speaker-notes"
    | "narrate-artifact"
    | "audition-voice"
    | "design-voice"
    | "compose-soundtrack"
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
    | "draft-brief"
    | "plan-outline"
    | "plan-section"
    | "write-section"
    | "request-write"
    | "request-plan"
    | "search-context"
    | "steer-sections"
    | "revise-outline"
    | "propose-generation"
    | "check-section"
    | "pick-arc"
    | "apply-patch"
    | "list-workspaces"
    | "create-artifact";

type ToolTier = "composite" | "action" | "primitive";
export type ToolEffect = "read" | "write" | "destructive";

// where a tool is exposed; internal = composition-only (never called directly)
export type ToolSurface = "agent" | "direct" | "mcp" | "api" | "internal";

// What a caller has to have been granted before a tool will run for them. In the product a session
// already carries it, so this only bites where permission was delegated: an OAuth token minted for
// an MCP client holds a subset of these and nothing else. Four, mapping onto what the product
// already distinguishes rather than onto the tool list.
export type ToolScope =
    | "artifacts:read"
    | "artifacts:write"
    | "artifacts:share"
    | "artifacts:delete";

export const TOOL_SCOPES = [
    "artifacts:read",
    "artifacts:write",
    "artifacts:share",
    "artifacts:delete",
] as const satisfies readonly ToolScope[];

export const isToolScope = (v: unknown): v is ToolScope =>
    typeof v === "string" && (TOOL_SCOPES as readonly string[]).includes(v);

/** What a consent screen calls each one; scope ids are not a sentence a person should have to read. */
export const SCOPE_LABEL: Record<ToolScope, string> = {
    "artifacts:read": "read your artifacts and templates",
    "artifacts:write": "create and edit artifacts",
    "artifacts:share": "create and change share links",
    "artifacts:delete": "move artifacts to the trash and restore them",
};

// The boolean entitlements a tool can be gated on. A numeric limit (how many sections, which export
// formats) shapes a call rather than permitting it, so it stays with the caller that knows the shape.
export type ToolFeature = {
    [K in keyof Features]: Features[K] extends boolean ? K : never;
}[keyof Features];

// showcase grouping for the credits table
type ToolCategory = "create" | "edit" | "text" | "media" | "theme" | "assist";

// a proposal runs no server body: it hands the client a block to apply, since only the client holds
// the thing it changes (the studio's outline, the steer note, a not-yet-created artifact)
type ToolKind = "server" | "proposal";

export interface MeterParams {
    length?: string; // "Short" | "Standard" | "In-depth"
    sections?: number;
    images?: number;
    imageSource?: "stock" | "ai"; // stock images are free; AI images metered per image
    textRuns?: number;
    variations?: number;
    speechUnits?: number; // thousands of characters synthesized; only narration means anything by it
    musicMinutes?: number; // minutes of music composed
}

interface ToolMeta {
    id: ToolId;
    title: string;
    summary: string;
    tier: ToolTier;
    surfaces: ToolSurface[];
    // What a call does to stored state. Absent = "write". The MCP surface turns this into the
    // readOnlyHint / destructiveHint annotations both directories check at review.
    effect?: ToolEffect;
    // Runs for anyone, with no account and no workspace: a curated catalog rather than somebody's
    // content. A delegated client may call it before it has a token, which is what lets a person see
    // what Galleo offers before deciding to sign in. Must be free, since there is no one to bill.
    public?: boolean;
    // The permission a delegated caller needs. Absent = derived from `effect` (see scopeFor); set it
    // only where the three effects cannot express the answer, which today is sharing.
    scope?: ToolScope;
    // A plan entitlement the workspace must hold. Checked in the executor, so it answers the same
    // way whichever surface the call came in on.
    requires?: ToolFeature;
    kind?: ToolKind; // default "server"
    // present on credit-costing tools; absent = free
    category?: ToolCategory;
    usage?: Usage; // typical units → typical cost via costOf()
    meter?: (m: MeterParams) => Usage; // scales cost with the job; absent = fixed-cost
    // What to HOLD before the work starts, when the real cost has no bound the estimate can see.
    // Absent = hold the estimate. The settle refunds the difference either way, so this only moves
    // where the gate sits, never what the user ends up paying.
    ceiling?: Usage;
    live?: boolean; // false/undefined = planned (no route yet)
}

type Traits = Pick<
    ToolMeta,
    | "kind"
    | "category"
    | "usage"
    | "meter"
    | "ceiling"
    | "live"
    | "effect"
    | "scope"
    | "requires"
    | "public"
>;

const meta = (
    id: ToolId,
    title: string,
    summary: string,
    tier: ToolTier,
    surfaces: ToolSurface[],
    traits?: Traits,
): ToolMeta => ({ id, title, summary, tier, surfaces, ...traits });

const AGENT_DIRECT: ToolSurface[] = ["agent", "direct"];
// Reachable over MCP today. A tool joins this list once it can take effect with no client to apply
// its result, which the read tools already can and the rest wait on (see `.docs/mcp.md`).
// The delegated surfaces move together. What an external AI client may do and what an integration
// may do are the same list, because the difference between them is how they authenticated, not what
// they are allowed to reach.
const OVER_MCP: ToolSurface[] = ["agent", "direct", "mcp", "api"];
const INTERNAL: ToolSurface[] = ["internal"];

// length chip → expected section count
export function sectionsForLength(length?: string): number {
    const l = (length ?? "").toLowerCase();
    if (l.startsWith("short")) return 7;
    if (l.startsWith("in") || l.startsWith("deep") || l.startsWith("long")) return 18;
    return 12;
}

const LENGTH_CHIPS = ["Short", "Standard", "In-depth"] as const;

/**
 * The chip closest to a section count, for a run whose length is implied by something else (a
 * borrowed shape says how many sections there are). The inverse of the above, and it reads the same
 * three thresholds, so moving one moves both.
 */
export function lengthForSections(n: number): string {
    return LENGTH_CHIPS.reduce((best, chip) =>
        Math.abs(sectionsForLength(chip) - n) < Math.abs(sectionsForLength(best) - n) ? chip : best,
    );
}

export const TOOLS: Record<ToolId, ToolMeta> = {
    "generate-artifact": meta(
        "generate-artifact",
        "Generate artifact",
        "Build a whole deck, doc, or site from a brief",
        "composite",
        OVER_MCP,
        {
            effect: "write",
            category: "create",
            live: true,
            usage: { plan: 1, section: 12, image: 3 },
            meter: (m) => {
                const n = m.sections ?? sectionsForLength(m.length);
                return {
                    plan: 1,
                    section: n,
                    image: m.imageSource === "ai" ? (m.images ?? Math.ceil(n / 4)) : 0,
                };
            },
        },
    ),
    "revise-artifact": meta(
        "revise-artifact",
        "Revise artifact",
        "Revise the whole piece per an instruction",
        "composite",
        AGENT_DIRECT,
        {
            category: "edit",
            usage: { section: 10 },
            meter: (m) => ({ section: Math.max(3, m.sections ?? 10) }),
        },
    ),
    "add-section": meta(
        "add-section",
        "Add section",
        "Generate a new section and propose inserting it",
        "composite",
        OVER_MCP,
        { category: "create", live: true, usage: { section: 1 } },
    ),
    "rewrite-section": meta(
        "rewrite-section",
        "Rewrite section",
        "Rewrite one existing section in place",
        "composite",
        OVER_MCP,
        { category: "edit", live: true, usage: { section: 1 } },
    ),
    "suggest-section-layouts": meta(
        "suggest-section-layouts",
        "Suggest layouts",
        "Propose alternative arrangements of one section, keeping its copy",
        "composite",
        AGENT_DIRECT,
        {
            category: "edit",
            live: true,
            usage: { section: 3 },
            meter: (m) => ({ section: Math.max(2, Math.min(4, m.variations ?? 3)) }),
        },
    ),
    "edit-artifact": meta(
        "edit-artifact",
        "Edit artifact",
        "Edit a section of another library artifact in place",
        "composite",
        OVER_MCP,
        { effect: "write", category: "edit", live: true, usage: { section: 1 } },
    ),
    "reorder-section": meta(
        "reorder-section",
        "Reorder section",
        "Move a section to a new position",
        "action",
        OVER_MCP,
        { effect: "write" },
    ),
    "remove-section": meta(
        "remove-section",
        "Remove section",
        "Delete a section",
        "action",
        OVER_MCP,
        { effect: "destructive" },
    ),
    "set-format": meta(
        "set-format",
        "Set format",
        "Re-render as deck / doc / web",
        "action",
        OVER_MCP,
        { effect: "write" },
    ),
    "set-theme": meta(
        "set-theme",
        "Set theme",
        "Switch the artifact to a built-in theme",
        "action",
        OVER_MCP,
        { effect: "write" },
    ),
    "revise-element": meta(
        "revise-element",
        "Revise element",
        "Rework a single element or cell",
        "composite",
        OVER_MCP,
        { category: "edit", live: true, usage: { text: 2 } },
    ),
    "ask-assistant": meta(
        "ask-assistant",
        "Ask the assistant",
        "A conversational agent turn — reasons over your artifact and chains the tools above",
        "composite",
        ["direct"],
        {
            category: "assist",
            live: true,
            usage: { reply: 1 },
            // a turn is one reply plus however many tools the agent decides to chain; hold enough
            // for roughly four section-sized calls so a near-empty balance cannot start one
            ceiling: { reply: 5 },
        },
    ),
    "rewrite-text": meta(
        "rewrite-text",
        "Rewrite text",
        "Rewrite one text run per an instruction",
        "action",
        AGENT_DIRECT,
        { category: "text", live: true, usage: { text: 1 } },
    ),
    // direct only: refining is a button the user presses, never something a run does on its own
    "refine-prompt": meta(
        "refine-prompt",
        "Refine prompt",
        "Turn a rough prompt into a fuller one for image, video, or theme generation",
        "action",
        ["direct"],
        { category: "assist", live: true, usage: { text: 1 } },
    ),
    "rewrite-passage": meta(
        "rewrite-passage",
        "Rewrite a passage",
        "Rewrite one passage inside a section, in place",
        "action",
        ["agent"],
        { category: "text", live: true, usage: { text: 1 } },
    ),
    "translate-text": meta(
        "translate-text",
        "Translate text",
        "Translate one text run",
        "action",
        AGENT_DIRECT,
        { category: "text", live: true, usage: { text: 1 } },
    ),
    "translate-artifact": meta(
        "translate-artifact",
        "Translate artifact",
        "Translate the whole piece",
        "action",
        AGENT_DIRECT,
        {
            category: "text",
            usage: { text: 12 },
            meter: (m) => ({ text: Math.max(1, m.textRuns ?? 12) }),
        },
    ),
    "suggest-title": meta(
        "suggest-title",
        "Suggest title",
        "Propose a title for the artifact",
        "action",
        AGENT_DIRECT,
        { category: "assist", usage: { text: 1 } },
    ),
    "generate-theme": meta(
        "generate-theme",
        "Generate theme",
        "Create a theme from a prompt",
        "action",
        AGENT_DIRECT,
        { category: "theme", live: true, usage: { theme: 1 } },
    ),
    // stock costs nothing; an AI variation is metered by the route, which counts what was really made
    reimage: meta(
        "reimage",
        "Replace an image",
        "Re-source a section's image or backdrop from a new description",
        "action",
        ["agent"],
        { category: "media" },
    ),
    "generate-image": meta(
        "generate-image",
        "Generate image",
        "Create an image with AI",
        "action",
        AGENT_DIRECT,
        {
            category: "media",
            live: true,
            usage: { image: 1 },
            meter: (m) => ({ image: Math.max(1, m.variations ?? 1) }),
        },
    ),
    // direct-only: no agent body, and a chat turn should not be able to spend 100 credits a call
    "generate-video": meta(
        "generate-video",
        "Generate video",
        "Create a short video clip with AI",
        "action",
        ["direct"],
        { category: "media", live: true, usage: { video: 1 } },
    ),
    "write-summary": meta(
        "write-summary",
        "Write summary",
        "Write a summary of the piece",
        "action",
        AGENT_DIRECT,
        { category: "assist", usage: { reply: 1 } },
    ),
    "write-alt-text": meta(
        "write-alt-text",
        "Write alt text",
        "Write alt text for an image",
        "action",
        AGENT_DIRECT,
        { category: "assist", usage: { text: 1 } },
    ),
    "write-speaker-notes": meta(
        "write-speaker-notes",
        "Write speaker notes",
        "Write presenter notes for slides",
        "action",
        AGENT_DIRECT,
        {
            category: "assist",
            live: true,
            // one call over the whole piece, but the work in it scales with how much there is to read
            usage: { text: 12 },
            meter: (m) => ({ text: Math.max(1, m.sections ?? sectionsForLength(m.length)) }),
        },
    ),
    "narrate-artifact": meta(
        "narrate-artifact",
        "Narrate",
        "Turn the speaker notes into spoken audio",
        "action",
        ["direct"],
        {
            category: "media",
            live: true,
            requires: "voiceNarration",
            // one unit is 1000 characters; a 12-section deck at ~700 each is about nine
            usage: { speech: 9 },
            meter: (m) => ({ speech: Math.max(1, m.speechUnits ?? 9) }),
        },
    ),
    "compose-soundtrack": meta(
        "compose-soundtrack",
        "Compose a soundtrack",
        "Generate an instrumental bed for a piece being presented",
        "action",
        ["direct"],
        {
            category: "media",
            live: true,
            requires: "backgroundMusic",
            // a two minute bed; a narrated piece asks for one as long as the voice
            usage: { music: 2 },
            meter: (m) => ({ music: Math.max(1, m.musicMinutes ?? 2) }),
        },
    ),
    "audition-voice": meta(
        "audition-voice",
        "Try a voice",
        "Hear a candidate voice read one line of your own",
        "action",
        ["direct"],
        // one short line, capped at 200 characters server-side. A `speech` unit would round a
        // 200-character sample up to a whole thousand, so this prices flat and closer to the truth.
        { category: "media", live: true, requires: "voiceNarration", usage: { text: 1 } },
    ),
    "design-voice": meta(
        "design-voice",
        "Design a voice",
        "Generate voice candidates from a written description",
        "action",
        ["direct"],
        {
            category: "media",
            live: true,
            requires: "voiceDesign",
            // The provider documents no flat price for this and each of the three candidates carries
            // a 100-1000 character sample, so the real cost is somewhere between 300 and 3000
            // characters. MEASURE IT against a real account before setting this. Until then the
            // ceiling holds the pessimistic end and the settle refunds the difference.
            usage: { speech: 1 },
            ceiling: { speech: 3 },
        },
    ),
    "suggest-sections": meta(
        "suggest-sections",
        "Suggest sections",
        "Propose what to add next",
        "action",
        AGENT_DIRECT,
    ),
    "show-sections": meta(
        "show-sections",
        "Show sections",
        "Display the existing sections as a carousel",
        "action",
        OVER_MCP,
        { effect: "read" },
    ),
    "find-artifacts": meta(
        "find-artifacts",
        "Find artifacts",
        "Search the user's library by title or topic",
        "action",
        OVER_MCP,
        { effect: "read" },
    ),
    "read-artifact": meta(
        "read-artifact",
        "Read artifact",
        "Load one artifact's content to summarize or edit it",
        "action",
        OVER_MCP,
        { effect: "read" },
    ),
    "rename-artifact": meta(
        "rename-artifact",
        "Rename artifact",
        "Rename an artifact",
        "action",
        OVER_MCP,
        { effect: "write" },
    ),
    "move-artifact": meta(
        "move-artifact",
        "Move artifact",
        "Move an artifact into a folder (or out)",
        "action",
        OVER_MCP,
        { effect: "write" },
    ),
    "duplicate-artifact": meta(
        "duplicate-artifact",
        "Duplicate artifact",
        "Make a copy of an artifact",
        "action",
        ["agent", "direct"],
    ),
    "trash-artifact": meta(
        "trash-artifact",
        "Trash artifact",
        "Move an artifact to Trash",
        "action",
        OVER_MCP,
        { effect: "destructive" },
    ),
    "restore-artifact": meta(
        "restore-artifact",
        "Restore artifact",
        "Restore an artifact from Trash",
        "action",
        OVER_MCP,
        // the trash pair travels together: whoever may move something there may bring it back
        { effect: "write", scope: "artifacts:delete" },
    ),
    "create-folder": meta("create-folder", "Create folder", "Make a new folder", "action", [
        "agent",
        "direct",
    ]),
    "share-artifact": meta(
        "share-artifact",
        "Share artifact",
        "Open the share options for an artifact",
        "action",
        ["agent", "direct"],
        // Handing a document to people outside the workspace is its own permission, not a write.
        // No `requires`: the tool opens the share panel rather than creating a link, and the panel
        // is where the plan's own limits are explained.
        { scope: "artifacts:share" },
    ),
    "export-artifact": meta(
        "export-artifact",
        "Export artifact",
        "Open an artifact to export it",
        "action",
        ["agent", "direct"],
    ),
    "create-artifact": meta(
        "create-artifact",
        "Create artifact",
        "Store a piece whose content is already known, with no generation",
        "action",
        OVER_MCP,
        { effect: "write", live: true },
    ),
    "list-workspaces": meta(
        "list-workspaces",
        "List workspaces",
        "The workspaces this account can reach, and which one is used by default",
        "action",
        OVER_MCP,
        { effect: "read", live: true },
    ),
    "find-templates": meta(
        "find-templates",
        "Find templates",
        "List the starter templates",
        "action",
        OVER_MCP,
        { effect: "read", public: true },
    ),
    "draft-brief": meta(
        "draft-brief",
        "Draft brief",
        "Expand a raw prompt into an editable structured brief",
        "action",
        ["direct"],
        { category: "create", live: true, usage: { text: 1 } },
    ),
    "plan-outline": meta(
        "plan-outline",
        "Plan outline",
        "Plan the arc: title, backdrop, ordered beats",
        "primitive",
        ["direct", "internal"],
        { category: "create", live: true, usage: { plan: 1 } },
    ),
    "plan-section": meta(
        "plan-section",
        "Plan section",
        "Decide one section's grid + per-cell blocks",
        "primitive",
        INTERNAL,
    ),
    "propose-generation": meta(
        "propose-generation",
        "Propose a generation",
        "Offer a brief the user confirms before anything is built",
        "action",
        ["agent"],
        { kind: "proposal", live: true },
    ),
    "revise-outline": meta(
        "revise-outline",
        "Revise the outline",
        "Add, remove, reorder or rewrite the beats of a run in progress",
        "action",
        ["agent"],
        { kind: "proposal", live: true },
    ),
    "steer-sections": meta(
        "steer-sections",
        "Steer the rest",
        "Set the standing note every section still to be written must follow",
        "action",
        ["agent"],
        { kind: "proposal", live: true },
    ),
    "request-write": meta(
        "request-write",
        "Write planned sections",
        "Offer to build beats that are planned but not yet written",
        "action",
        ["agent"],
        { kind: "proposal", live: true },
    ),
    "request-plan": meta(
        "request-plan",
        "Plan the outline",
        "Offer to plan — or replan — the run's outline from its brief",
        "action",
        ["agent"],
        { kind: "proposal", live: true },
    ),
    "search-context": meta(
        "search-context",
        "Search the attached contexts",
        "Retrieve passages from the conversation's attached context collections",
        "action",
        ["agent"],
        { live: true },
    ),
    "write-section": meta(
        "write-section",
        "Write section",
        "Write the content that fills a planned grid",
        "primitive",
        INTERNAL,
    ),
    "check-section": meta(
        "check-section",
        "Check section",
        "Audit a section for quality issues",
        "primitive",
        INTERNAL,
    ),
    "pick-arc": meta(
        "pick-arc",
        "Pick arc",
        "Select the narrative-arc scaffold for a brief",
        "primitive",
        INTERNAL,
    ),
    "apply-patch": meta(
        "apply-patch",
        "Apply patch",
        "Commit a proposed patch to the artifact",
        "action",
        ["mcp", "direct"],
    ),
};

// only tools that are BOTH priced (usage) and live, so no unbuyable prices
export const PRICED_TOOLS: ToolMeta[] = Object.values(TOOLS).filter((t) => t.usage && t.live);

// The permission one call needs. `effect` answers three of the four, and a tool whose scope it
// cannot express declares one. The fallback leans restrictive on purpose: a tool that says nothing
// at all lands on write, never on read, so forgetting to annotate cannot widen a token's reach.
/** Needs no account: callable before a client has a token at all. */
export const isPublicTool = (id: ToolId): boolean => TOOLS[id]?.public === true;

export const scopeFor = (id: ToolId): ToolScope => {
    const def = TOOLS[id];
    if (def.scope) return def.scope;
    if (def.effect === "read") return "artifacts:read";
    if (def.effect === "destructive") return "artifacts:delete";
    return "artifacts:write";
};

/** The scopes a set of tools needs between them, in catalog order, for a consent screen to list. */
export const scopesForTools = (ids: readonly ToolId[]): ToolScope[] => {
    const need = new Set(ids.map(scopeFor));
    return TOOL_SCOPES.filter((s) => need.has(s));
};

// the units of work a run is expected to be made of, for the ledger and for costing
export function usageFor(id: ToolId, m: MeterParams = {}): Usage {
    const t = TOOLS[id];
    return t.meter ? t.meter(m) : (t.usage ?? {});
}

// A tool with neither usage nor a meter is free by construction. costOf floors at 1 so that a real
// call is never billed nothing; free is a different case and has to reach zero, or every unpriced
// tool would quietly cost a credit.
const isFree = (id: ToolId): boolean => !TOOLS[id].usage && !TOOLS[id].meter;

// what a run typically costs: the number the UI previews and the credits table lists
export function estimateCost(id: ToolId, m?: MeterParams, rates?: UnitRates): number {
    return isFree(id) ? 0 : costOf(usageFor(id, m), rates);
}

// what the pre-flight gate holds, which is the estimate unless the tool declares a ceiling
export function reserveCost(id: ToolId, m?: MeterParams, rates?: UnitRates): number {
    const ceiling = TOOLS[id].ceiling;
    return ceiling && !isFree(id) ? costOf(ceiling, rates) : estimateCost(id, m, rates);
}

// headline cost, ignoring job size
export function typicalCost(id: ToolId): number {
    return isFree(id) ? 0 : costOf(TOOLS[id].usage ?? {});
}

export function isMetered(id: ToolId): boolean {
    return !!TOOLS[id].meter;
}

// min == max for fixed-cost tools
const SMALL: MeterParams = {
    length: "Short",
    sections: 6,
    textRuns: 5,
    speechUnits: 4, // a short deck's scripts, in thousands of characters
    musicMinutes: 2,
    images: 2,
    variations: 1,
    imageSource: "stock",
};
const LARGE: MeterParams = {
    length: "In-depth",
    sections: 20,
    textRuns: 40,
    speechUnits: 18,
    musicMinutes: 8,
    images: 6,
    variations: 4,
    imageSource: "ai",
};
export function costRange(id: ToolId): { min: number; max: number } {
    const t = TOOLS[id];
    if (!t.meter) {
        const c = typicalCost(id);
        return { min: c, max: c };
    }
    return { min: costOf(t.meter(SMALL)), max: costOf(t.meter(LARGE)) };
}

// shared input fragments, used by more than one tool
// Defaulted rather than required, because a delegated caller has no way to know Galleo's theme ids
// and should not have to ask: the brief is the only thing it genuinely has to supply.
const zBrief = z.object({
    prompt: z
        .string()
        .describe("one line saying what to build, e.g. 'a pitch deck for a solar startup'"),
    surface: z
        .enum(["deck", "doc", "web"])
        .default("deck")
        .describe("what to render it as; the same content works as any of the three"),
    theme: z.string().default("studio").describe("a Galleo theme id; omit for the default"),
    goal: z.string().optional().describe("what the piece is for"),
    audience: z.string().optional().describe("who will read it"),
    tone: z.string().optional().describe("how it should read, e.g. 'plain and technical'"),
    length: z
        .string()
        .optional()
        .describe("Short, Standard, or In-depth; longer costs more credits"),
    contextIds: z.array(z.string()).optional(),
    source: z.string().optional().describe("material to build from, pasted in"),
    sourceArtifactId: z
        .string()
        .optional()
        .describe("repurpose an existing artifact, by id, into this new one"),
});

// What the agent is told about a tool and what it accepts. Server-only and bulky (long prose,
// zod schemas), so it sits beside TOOLS rather than inside it: a client importing this module for
// a cost estimate tree-shakes all of it away.
export interface ToolSpec {
    describe: string;
    input: ZodType;
}

export const TOOL_SPEC = {
    "plan-outline": {
        describe:
            "Plan the arc of a piece from its brief: title, backdrop, and the ordered beats with the job each one does.",
        input: zBrief,
    },
    "draft-brief": {
        describe:
            "Expand a raw one-line prompt into a structured brief — goal, audience, tone, and the points it must cover.",
        input: z.object({
            prompt: z.string().describe("the raw prompt to expand"),
            surface: z.enum(["deck", "doc", "web"]).optional(),
            previous: z
                .object({
                    goal: z.string(),
                    audience: z.string(),
                    tone: z.string(),
                    mustInclude: z.array(z.string()).optional(),
                })
                .optional()
                .describe("a previous read to rule out, so a re-read lands somewhere else"),
        }),
    },
    "propose-generation": {
        describe:
            "Propose building a whole NEW artifact (deck, doc, or site) from a one-line brief. This does NOT build it — it shows the user a confirm card with the brief; they click Generate to build it right here. Reach for this the moment the user wants to CREATE something new (there's no open document to edit). Distill the conversation to ONE tight, specific sentence — subject, angle, and audience — and pick the surface that fits. When the user is explicitly telling you to build NOW (approving a brief you already proposed — 'yes', 'go ahead', 'generate it'), call this again with the same or refined brief and approved: true — the build starts immediately, no second card to click.",
        input: z.object({
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
            approved: z
                .boolean()
                .optional()
                .describe(
                    "true ONLY when the user's message explicitly says to build it now (approving a proposed brief: 'yes', 'go ahead', 'generate it now') — the build starts immediately without a confirm click. Leave unset on a first proposal.",
                ),
        }),
    },
    "revise-outline": {
        describe:
            "Revise the OUTLINE of the piece being generated right now: add a beat, remove one, move one, or rewrite what a beat must say. Use this for anything structural or about intent — it is the main way you change a run in progress. Beats not yet written are free to change. Write real substance (claims, numbers, comparisons), never topic labels.",
        input: z.object({
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
            approved: z
                .boolean()
                .optional()
                .describe(
                    "true ONLY when the user's message explicitly says to apply it now (approving a change you already proposed: 'yes', 'go ahead', 'update it') — the outline is updated immediately without a confirm click. Leave unset on a first proposal.",
                ),
        }),
    },
    "steer-sections": {
        describe:
            "Set the standing note that every section STILL TO BE WRITTEN must follow — tone, angle, emphasis, a constraint to respect. Use it when the user asks for something to hold across the rest of the run ('keep the rest short', 'more concrete numbers from here'), rather than a change to one beat. It does not touch sections already written; rewrite those instead. Pass an empty note to drop the current one.",
        input: z.object({
            note: z
                .string()
                .describe(
                    "the instruction to hold for the rest of the run; empty string clears it",
                ),
        }),
    },
    "search-context": {
        describe:
            "Search the context collections the user attached to this conversation — their uploaded files, saved links, and library artifacts. Returns the most relevant passages with their sources. Use it whenever a real fact, number, or quote from their material would beat your general knowledge.",
        input: z.object({
            query: z
                .string()
                .describe("what to look for — a focused question or topic, not a list"),
        }),
    },
    "request-plan": {
        describe:
            "Replan the run's OUTLINE from scratch when the user wants a genuinely different arc (for adjustments to existing beats use revise-outline instead). This offers a card; the plan turn runs when the user starts it, and the current beats are replaced.",
        input: z.object({
            summary: z.string().describe("one short line naming the ask, e.g. 'Plan the outline'"),
            guidance: z
                .string()
                .optional()
                .describe(
                    "the user's shaping asks, in their words — length, angle, what to lead with (e.g. '9 sections max, lead with the pilot proof')",
                ),
            andWrite: z
                .boolean()
                .optional()
                .describe(
                    "true only when the user wants every section written straight after planning, without stopping at the outline",
                ),
            approved: z
                .boolean()
                .optional()
                .describe(
                    "true ONLY when the user's message explicitly says to plan it now (approving a plan you already offered, or an unambiguous imperative: 'go ahead', 'plan it', 'just build it') — the plan turn starts immediately without a confirm click. Leave unset on a first offer.",
                ),
        }),
    },
    "request-write": {
        describe:
            "Write sections that are ALREADY PLANNED in the outline — the beats listed below that are not yet written. This is how you turn the plan into real content: pass the beat ids (s2, s3, …). Use this whenever the user asks to write, build, generate, or draft sections that exist in the outline. Do NOT use add-section for those — add-section creates a brand-new section beside the plan instead of writing the planned one.",
        input: z.object({
            beatIds: z
                .array(z.string())
                .min(1)
                .describe("the outline beat ids to write, in the order they should be written"),
            summary: z
                .string()
                .describe("one short line naming what gets written, e.g. 'Write sections 2 to 5'"),
            approved: z
                .boolean()
                .optional()
                .describe(
                    "true ONLY when the user's message explicitly says to write them now (approving a write you already offered: 'yes', 'go ahead', 'write it') — the writing starts immediately without a confirm click. Leave unset on a first offer.",
                ),
        }),
    },
    "add-section": {
        describe:
            "Generate ONE new section for the open artifact and return it for insertion. afterId = the section id it should follow (null = at the end).",
        input: z.object({
            afterId: z
                .string()
                .nullable()
                .describe("the section id to insert after, or null for the end"),
            instruction: z.string().describe("what the new section should be about"),
        }),
    },
    "create-folder": {
        describe: "Create a new folder in the workspace. name = the folder name.",
        input: z.object({ name: z.string().describe("the folder name") }),
    },
    "duplicate-artifact": {
        describe:
            "Make a copy of an artifact (kept in the same folder). artifactId = its id. Good for spinning a variant.",
        input: z.object({ artifactId: z.string() }),
    },
    "edit-artifact": {
        describe:
            "Rewrite a section of one of the user's OTHER artifacts — one that is NOT currently open — found via find-artifacts and inspected via read-artifact. Use it to change a specific library artifact from here (e.g. 'make the intro of my Aria deck punchier'). Returns a proposal the user applies; applying saves to that artifact.",
        input: z.object({
            artifactId: z.string().describe("the target artifact id (from find-artifacts)"),
            sectionId: z.string().describe("the id of the section to rewrite (from read-artifact)"),
            instruction: z.string().describe("what to change about that section"),
        }),
    },
    "export-artifact": {
        describe:
            "Open an artifact so the user can export it (PDF / PNG / etc.). artifactId = its id. This opens the artifact in the editor, where the Export menu lives — it does not download anything on its own.",
        input: z.object({ artifactId: z.string() }),
    },
    "find-artifacts": {
        describe:
            "Search the user's library for their existing artifacts by title or topic. Returns a short list of matches (id, title, format). Use it whenever the user refers to something they already made — find the one they mean before reading or editing it. Leave `query` empty to list their most recent work.",
        input: z.object({
            query: z
                .string()
                .optional()
                .describe("words to match against titles/topics; omit to list the most recent"),
        }),
    },
    "generate-image": {
        describe:
            "Make an image from a description. `prompt` describes the picture itself, not an instruction ('a quiet studio at dusk, warm light', not 'make me a photo'). Pass `ref` (an existing image url) to refine that image instead of starting fresh — then `prompt` reads as the change you want. Returns a url.",
        input: z.object({
            prompt: z.string().describe("what the picture shows"),
            orientation: z
                .enum(["landscape", "portrait", "square"])
                .optional()
                .describe("preferred shape (default landscape)"),
            ref: z
                .string()
                .optional()
                .describe("url of an image to refine rather than replace; usually left unset"),
        }),
    },
    "create-artifact": {
        describe:
            "Store a deck, doc or site whose content you already have, exactly as given. Nothing is generated and nothing is charged, so this is the one to use when the content comes from somewhere else. To make something from a brief instead, use generate-artifact.",
        input: z.object({
            title: z.string().describe("what to call it"),
            // looseObject, not object: this schema carries stored content, and a plain object would
            // strip every field the api layer does not happen to enumerate on the way to the row
            content: z
                .looseObject({
                    format: z.enum(["deck", "doc", "web"]).describe("how it renders"),
                    theme: z.string().describe("a Galleo theme id"),
                    sections: z
                        .array(z.looseObject({ id: z.string(), root: z.looseObject({}) }))
                        .min(1),
                })
                .describe("the artifact tree: { format, theme, sections }"),
        }),
    },
    "list-workspaces": {
        describe:
            "List the workspaces this connection can act in, with the role held in each and which one is used when a call does not name one. Call it when the person asks where something lives, or before acting somewhere other than the default.",
        input: z.object({}),
    },
    "find-templates": {
        describe:
            "List Galleo's starter templates (id, name, category) — pre-built decks/docs/pages the user can start from. Use it when they ask what templates exist, or want to start from one. Optionally filter by a topic/category word.",
        input: z.object({
            query: z
                .string()
                .optional()
                .describe("a topic/category word to filter by; omit for all"),
        }),
    },
    "generate-artifact": {
        describe:
            "Build a whole deck, doc, or site from a brief — plans an outline, then writes and streams each section in order. Can build FROM source material (pasted text via `source`, or an existing artifact via `sourceArtifactId` — repurpose).",
        input: zBrief,
    },
    // No body yet (services/api/narration.ts drives the provider directly), but the entry has to
    // exist before one can be registered, and it is what makes the executor's entitlement gate
    // reachable in a test rather than only in production.
    "narrate-artifact": {
        describe:
            "Turn the speaker notes on this piece into spoken audio, one track per section that has a script.",
        input: z.object({
            sectionIds: z
                .array(z.string())
                .optional()
                .describe("only these sections; omit for the whole piece"),
        }),
    },
    "generate-theme": {
        describe:
            "Create a theme (palette, mood, light/dark) from a text prompt — e.g. 'a warm editorial magazine look'.",
        input: z.object({
            prompt: z.string().describe("the look/mood to design toward"),
            isDark: z
                .boolean()
                .optional()
                .describe("force a dark theme (else inferred from the prompt)"),
        }),
    },
    "move-artifact": {
        describe:
            "Move an artifact into a folder, or out of one. artifactId = its id; folderId = the target folder id (from the workspace's folder list), or null to remove it from any folder.",
        input: z.object({
            artifactId: z.string(),
            folderId: z.string().nullable().describe("target folder id, or null for no folder"),
        }),
    },
    "read-artifact": {
        describe:
            "Load ONE artifact's content by id (from find-artifacts) and get a compact digest — its title, format, the section spine, and a per-section summary. Use it to answer questions about an existing piece, or before proposing an edit to it. Reads only; it changes nothing.",
        input: z.object({
            id: z.string().describe("the artifact id, as returned by find-artifacts"),
        }),
    },
    reimage: {
        describe:
            "Replace an image with one sourced from a new description — the section's own image, or the piece's full-bleed backdrop. Use it when the picture is wrong for the words. `phrase` is a vivid description of the photo you want, not an instruction.",
        input: z.object({
            sectionId: z
                .string()
                .describe("the section whose image to replace; also the anchor for the backdrop"),
            phrase: z
                .string()
                .describe("a vivid description of the wanted photo, e.g. 'a quiet studio at dawn'"),
            target: z
                .enum(["image", "backdrop"])
                .optional()
                .describe(
                    "the section's image element (default), or the section's full-bleed backdrop",
                ),
            nth: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("which image, when the section has several (default 0)"),
        }),
    },
    "remove-section": {
        describe:
            "Remove a section from the current artifact. sectionId = the section to delete; label = its short heading, for the summary.",
        input: z.object({
            sectionId: z.string(),
            label: z.string().optional().describe("the section's heading, for the summary"),
        }),
    },
    "rename-artifact": {
        describe:
            "Rename one of the user's artifacts. artifactId = its id (from find-artifacts); title = the new title.",
        input: z.object({
            artifactId: z.string(),
            title: z.string().describe("the new title"),
        }),
    },
    "reorder-section": {
        describe:
            "Move a section to a new position in the current artifact. sectionId = the section to move; afterId = the id of the section it should follow, or null to move it to the front. label = its short heading, for the summary.",
        input: z.object({
            sectionId: z.string(),
            afterId: z.string().nullable(),
            label: z.string().optional().describe("the section's heading, for the summary"),
        }),
    },
    "restore-artifact": {
        describe: "Restore an artifact from Trash back into the library. artifactId = its id.",
        input: z.object({ artifactId: z.string() }),
    },
    "revise-element": {
        describe:
            "Regenerate ONE element in place — a fresh, stronger version of the SAME element type, leaving the rest of the section alone. Reach for it when a chart, stat, table or diagram is weak but the section around it is fine. `elementType` is the element's type (chart · stat · table · diagram · image · quote …); `nth` picks between several of that type in the same section (0 = the first).",
        input: z.object({
            sectionId: z.string().describe("the id of the section the element is in"),
            elementType: z
                .string()
                .optional()
                .describe("the element's type, e.g. 'chart' or 'stat'"),
            nth: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("which one, when the section has several of that type (default 0)"),
            // The editor points with a selection and knows the exact node; an agent has neither and
            // names a type instead. One tool, two ways to say which element, so the direct route and
            // the agent run the same body rather than a copy of it.
            path: z
                .array(z.number().int().min(0))
                .optional()
                .describe("the element's index path, for a caller that already has one"),
            instruction: z
                .string()
                .optional()
                .describe("optional: how to change it; omit for a straight re-roll"),
        }),
    },
    "rewrite-passage": {
        describe:
            "Rewrite ONE passage inside a section, leaving the rest of it untouched. Use this when the user wants specific wording changed (a headline, a bullet, a sentence) rather than the whole section rewritten. `find` must be copied from the section's real text.",
        input: z.object({
            sectionId: z.string().describe("the id of the section the passage is in"),
            find: z
                .string()
                .describe(
                    "the passage to rewrite, copied VERBATIM from the section's current text",
                ),
            instruction: z
                .string()
                .describe("how to change it, e.g. 'make it punchier' or 'cut it to six words'"),
        }),
    },
    "rewrite-section": {
        describe:
            "Rewrite an existing section to satisfy an instruction and return the revised section. sectionId = the id from the section map.",
        input: z.object({
            sectionId: z.string().describe("the id of the section to rewrite"),
            instruction: z.string().describe("what to change about it"),
        }),
    },
    "rewrite-text": {
        describe:
            "Rewrite ONE passage of text per an instruction (make it punchier, shorter, longer, more formal, fix grammar, …). Returns just the rewritten text.",
        input: z.object({
            text: z.string().describe("the passage to rewrite"),
            instruction: z.string().describe("how to change it, e.g. 'make it more concise'"),
            context: z
                .string()
                .optional()
                .describe("the surrounding copy, so a rewritten fragment still fits where it sits"),
        }),
    },
    "refine-prompt": {
        describe:
            "Expand a rough prompt into a fuller, more specific one for the named kind of generation. Returns just the refined prompt.",
        input: z.object({
            prompt: z.string().describe("the user's rough prompt"),
            kind: z
                .enum(["image", "video", "theme"])
                .describe("what the prompt will generate, which decides how it is refined"),
            context: z
                .string()
                .optional()
                .describe("nearby copy or the active theme, to keep the result on-brief"),
        }),
    },
    "set-format": {
        describe:
            "Re-render the current artifact in a different format — deck (slides), doc (a document), or web (a page). The content is the same; only the layout changes.",
        input: z.object({ format: z.enum(["deck", "doc", "web"]) }),
    },
    "set-theme": {
        describe:
            "Switch the current artifact to one of Galleo's built-in themes. theme = the theme id (from the theme list in the prompt). Use it for 'make it darker/warmer/more editorial' etc. — pick the theme whose mood fits.",
        input: z.object({ theme: z.string().describe("a built-in theme id") }),
    },
    "share-artifact": {
        describe:
            "Open the share options for an artifact so the user can publish a link. artifactId = its id. This does NOT publish — it opens the share panel where the user chooses visibility and explicitly creates the link. Use it when they ask to share/publish/send a piece.",
        input: z.object({ artifactId: z.string() }),
    },
    "show-sections": {
        describe:
            "Display the artifact's existing sections as a scrollable carousel of previews. Use when the user asks to see, scan, or list the sections they already have — this SHOWS content, it doesn't change it.",
        input: z.object({}),
    },
    "suggest-sections": {
        describe:
            "Propose 3–6 short section ideas that would strengthen the open artifact. Use when the user asks what to add, or for ideas.",
        input: z.object({}),
    },
    "write-speaker-notes": {
        describe:
            "Write speaker notes for the open artifact: what the presenter says out loud over each section, plus private cues only they see. The spoken script is what a voice reads when the piece narrates itself. Use when the user asks for speaker notes, presenter notes, a script, or something to say. Writes the whole piece by default; pass sectionIds to redo only some. This replaces the notes on the sections it writes.",
        input: z.object({
            sectionIds: z
                .array(z.string())
                .optional()
                .describe(
                    "the sections to write notes for; omit to write the whole piece, which is the usual case",
                ),
        }),
    },
    "suggest-section-layouts": {
        describe:
            "Generate 2–4 alternative LAYOUTS of one existing section: the same copy and images, arranged differently. Use when the user wants layout options or a different look for a section — NOT for changing what it says (that is rewrite-section).",
        input: z.object({
            sectionId: z.string().describe("the section to re-lay out"),
            count: z
                .number()
                .int()
                .min(2)
                .max(4)
                .optional()
                .describe("how many alternatives (default 3)"),
            direction: z
                .string()
                .optional()
                .describe("optional styling steer, e.g. 'more visual' or 'lead with the stat'"),
        }),
    },
    "translate-text": {
        describe:
            "Translate ONE passage of text into a target language. Returns just the translated text.",
        input: z.object({
            text: z.string().describe("the passage to translate"),
            language: z.string().describe("the target language, e.g. 'Spanish' or 'Japanese'"),
            context: z
                .string()
                .optional()
                .describe(
                    "the surrounding copy, so a translated fragment still fits where it sits",
                ),
        }),
    },
    "trash-artifact": {
        describe:
            "Move an artifact to Trash (recoverable). artifactId = its id. Use only when the user clearly wants to delete/remove it — the user still confirms before it happens.",
        input: z.object({ artifactId: z.string() }),
    },
} satisfies Partial<Record<ToolId, ToolSpec>>;

/** A tool's input type, taken from its definition so an implementation cannot disagree with it. */
export type ToolInput<Id extends ToolId> = Id extends keyof typeof TOOL_SPEC
    ? z.infer<(typeof TOOL_SPEC)[Id]["input"]>
    : never;
