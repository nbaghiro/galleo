import { z } from "zod";
import type { ZodType } from "zod";
// Every tool Galleo can run, defined once. A definition carries what the tool is (title, summary),
// what the agent is told about it (`describe`), where it is exposed (`surfaces`), when the agent is
// offered it (`needs` / `without`), whether the in-app agent waits for a click (`confirm`), and what
// it costs (`usage`/`meter`, absent = free). The run half lives in services/core/ai/tools.ts, which
// refuses to register a body whose id has no definition here.
//
// Input schemas sit in TOOL_SPEC rather than on the definitions, so a client importing this module
// for a cost estimate tree-shakes zod and all the schemas out of its bundle.

import type { ChatInput, Patch } from "./ai";
import type { Features } from "./billing";
import type { UnitPrices, Usage } from "./credits";
import { creditsForUsd, DEFAULT_UNIT_PRICES, usdOfUsage } from "./credits";

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
    | "read-file"
    | "rename-artifact"
    | "move-artifact"
    | "duplicate-artifact"
    | "trash-artifact"
    | "restore-artifact"
    | "create-folder"
    | "share-artifact"
    | "export-artifact"
    | "find-templates"
    | "start-generation"
    | "plan-outline"
    | "plan-section"
    | "write-section"
    | "revise-brief"
    | "revise-outline"
    | "steer-generation"
    | "write-beat"
    | "write-beats"
    | "pick-version"
    | "read-generation"
    | "finish-generation"
    | "search-context"
    | "check-section"
    | "pick-arc"
    | "apply-patch"
    | "list-workspaces"
    | "create-artifact";

type ToolTier = "composite" | "action" | "primitive";
export type ToolEffect = "read" | "write" | "destructive";

// where a tool is exposed; internal = composition-only (never called directly)
export type ToolSurface = "agent" | "direct" | "mcp" | "api" | "internal";

// What has to be in the tool context for the agent to be offered a tool: the open artifact, a
// generation in progress, the library reader, attached context collections.
export type ToolNeed = "artifact" | "generation" | "library" | "contexts";

// What the in-app agent does with a call. `before` proposes it and runs nothing until the user
// clicks (it costs, or it creates). `after` runs it and proposes the change it made, applied on
// click. `never` runs and applies on arrival. Every other surface applies immediately.
export type ToolConfirm = "before" | "after" | "never";

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

export interface MeterParams {
    length?: string; // "Short" | "Standard" | "In-depth"
    sections?: number;
    images?: number;
    imageSource?: "stock" | "ai"; // stock images are free; AI images metered per image
    textRuns?: number;
    variations?: number;
    speechUnits?: number; // thousands of characters synthesized; only narration means anything by it
    musicMinutes?: number;
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
    needs?: ToolNeed[]; // offered to the agent only when every one is present
    without?: ToolNeed[]; // and none of these is
    confirm?: ToolConfirm; // absent = never
    /**
     * This tool deliberately costs the caller nothing. Say it rather than leaving the price off:
     * an unpriced tool takes the free branch in reserve(), which never settles, so a body that
     * reaches a provider would burn tokens nobody is billed for. check:tools fails when a tool with
     * a registered body declares neither a price nor this.
     */
    free?: true;
    // A free doorway to a priced step: refuse when this much could not be paid for, without
    // charging. Keeps the step's refusal from landing after the doorway created something
    // (a draft with no plan it can afford); the step itself still reserves atomically.
    gate?: Usage;
    // present on credit-costing tools; absent = free
    category?: ToolCategory;
    usage?: Usage; // the units a typical run produces; priced by the caller's UnitPrices
    meter?: (m: MeterParams) => Usage; // scales cost with the job; absent = fixed-cost
    // What to HOLD before the work starts, when the real cost has no bound the estimate can see.
    // Absent = hold the estimate. The settle refunds the difference either way, so this only moves
    // where the gate sits, never what the user ends up paying.
    ceiling?: Usage;
    live?: boolean; // false/undefined = planned (no route yet)
}

type Traits = Pick<
    ToolMeta,
    | "category"
    | "free"
    | "gate"
    | "usage"
    | "meter"
    | "ceiling"
    | "live"
    | "effect"
    | "scope"
    | "requires"
    | "public"
    | "needs"
    | "without"
    | "confirm"
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

// what writing n sections costs, with an AI image for roughly every fourth when the run asks for it
const sectionsUsage = (m: MeterParams, fallback: number): Usage => {
    const n = m.sections ?? fallback;
    return {
        section: n,
        image: m.imageSource === "ai" ? (m.images ?? Math.ceil(n / 4)) : 0,
    };
};

export const TOOLS: Record<ToolId, ToolMeta> = {
    // the one-call composite: start, plan, write every beat, finish. Kept off the agent surface on
    // purpose, since start-generation gives a conversation every stop the studio has
    "generate-artifact": meta(
        "generate-artifact",
        "Generate artifact",
        "Build a whole deck, doc, or site from a brief",
        "composite",
        ["direct", "mcp", "api"],
        {
            effect: "write",
            category: "create",
            live: true,
            confirm: "before",
            // the stock-photo default, which is the path a run takes unless the intake form opts
            // into AI images; the meter below adds those only when it does
            usage: { plan: 1, section: 12 },
            meter: (m) => ({
                plan: 1,
                ...sectionsUsage(m, sectionsForLength(m.length)),
            }),
        },
    ),
    "start-generation": meta(
        "start-generation",
        "Start a generation",
        "Open a piece from a brief: its draft and its plan-to-be, nothing written yet",
        "action",
        OVER_MCP,
        {
            effect: "write",
            live: true,
            free: true,
            gate: { plan: 1 },
            confirm: "before",
            without: ["generation"],
        },
    ),
    "plan-outline": meta(
        "plan-outline",
        "Plan the outline",
        "Plan the arc of a generation: title, backdrop, ordered beats",
        "action",
        OVER_MCP,
        {
            effect: "write",
            category: "create",
            live: true,
            confirm: "before",
            needs: ["generation"],
            usage: { plan: 1 },
        },
    ),
    "revise-brief": meta(
        "revise-brief",
        "Revise the brief",
        "Change what a generation is for, who it is for, and what it must cover",
        "action",
        OVER_MCP,
        { effect: "write", live: true, free: true, confirm: "never", needs: ["generation"] },
    ),
    "revise-outline": meta(
        "revise-outline",
        "Revise the outline",
        "Add, remove, reorder or rewrite the beats of a generation",
        "action",
        OVER_MCP,
        { effect: "write", live: true, free: true, confirm: "after", needs: ["generation"] },
    ),
    "steer-generation": meta(
        "steer-generation",
        "Steer the rest",
        "Set the standing note every section still to be written must follow",
        "action",
        OVER_MCP,
        { effect: "write", live: true, free: true, confirm: "never", needs: ["generation"] },
    ),
    "write-beat": meta(
        "write-beat",
        "Write a section",
        "Write one planned beat of a generation, or rework it with a note",
        "composite",
        OVER_MCP,
        {
            effect: "write",
            category: "create",
            live: true,
            confirm: "before",
            needs: ["generation"],
            usage: { section: 1 },
            meter: (m) => sectionsUsage(m, 1),
        },
    ),
    "write-beats": meta(
        "write-beats",
        "Write sections",
        "Write the planned beats of a generation in order",
        "composite",
        OVER_MCP,
        {
            effect: "write",
            category: "create",
            live: true,
            confirm: "before",
            needs: ["generation"],
            usage: { section: 12 },
            meter: (m) => sectionsUsage(m, sectionsForLength(m.length)),
        },
    ),
    "pick-version": meta(
        "pick-version",
        "Pick a take",
        "Make one take of a section the one the piece carries",
        "action",
        OVER_MCP,
        { effect: "write", live: true, free: true, confirm: "never", needs: ["generation"] },
    ),
    "read-generation": meta(
        "read-generation",
        "Read the generation",
        "The brief, the outline, the standing note and what is written so far",
        "action",
        OVER_MCP,
        { effect: "read", live: true, free: true, confirm: "never", needs: ["generation"] },
    ),
    "finish-generation": meta(
        "finish-generation",
        "Finish the generation",
        "Close a generation and record how the piece was made",
        "action",
        OVER_MCP,
        { effect: "write", live: true, free: true, confirm: "never", needs: ["generation"] },
    ),
    "apply-patch": meta(
        "apply-patch",
        "Apply a proposal",
        "Apply a change the agent proposed and the user approved",
        "action",
        AGENT_DIRECT,
        { effect: "write", live: true, free: true, confirm: "never" },
    ),
    "revise-artifact": meta(
        "revise-artifact",
        "Revise artifact",
        "Revise the whole piece per an instruction",
        "composite",
        AGENT_DIRECT,
        {
            category: "edit",
            confirm: "after",
            needs: ["artifact"],
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
        {
            category: "create",
            live: true,
            confirm: "after",
            needs: ["artifact"],
            usage: { section: 1 },
        },
    ),
    "rewrite-section": meta(
        "rewrite-section",
        "Rewrite section",
        "Rewrite one existing section in place",
        "composite",
        OVER_MCP,
        {
            category: "edit",
            live: true,
            confirm: "after",
            needs: ["artifact"],
            usage: { section: 1 },
        },
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
            confirm: "after",
            needs: ["artifact"],
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
        {
            effect: "write",
            category: "edit",
            live: true,
            confirm: "after",
            needs: ["library"],
            without: ["generation"],
            usage: { section: 1 },
        },
    ),
    "reorder-section": meta(
        "reorder-section",
        "Reorder section",
        "Move a section to a new position",
        "action",
        OVER_MCP,
        { effect: "write", free: true, confirm: "after", needs: ["artifact"] },
    ),
    "remove-section": meta(
        "remove-section",
        "Remove section",
        "Delete a section",
        "action",
        OVER_MCP,
        { effect: "destructive", free: true, confirm: "after", needs: ["artifact"] },
    ),
    "set-format": meta(
        "set-format",
        "Set format",
        "Re-render as deck / doc / web",
        "action",
        OVER_MCP,
        { effect: "write", free: true, confirm: "after", needs: ["artifact"] },
    ),
    "set-theme": meta(
        "set-theme",
        "Set theme",
        "Switch the artifact to a built-in theme",
        "action",
        OVER_MCP,
        { effect: "write", free: true, confirm: "after", needs: ["artifact"] },
    ),
    "revise-element": meta(
        "revise-element",
        "Revise element",
        "Rework a single element or cell",
        "composite",
        OVER_MCP,
        { category: "edit", live: true, confirm: "after", needs: ["artifact"], usage: { text: 2 } },
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
        { category: "text", live: true, confirm: "never", usage: { text: 1 } },
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
        { category: "text", live: true, confirm: "after", needs: ["artifact"], usage: { text: 1 } },
    ),
    "translate-text": meta(
        "translate-text",
        "Translate text",
        "Translate one text run",
        "action",
        AGENT_DIRECT,
        { category: "text", live: true, confirm: "never", usage: { text: 1 } },
    ),
    "translate-artifact": meta(
        "translate-artifact",
        "Translate artifact",
        "Translate the whole piece",
        "action",
        AGENT_DIRECT,
        {
            category: "text",
            confirm: "after",
            needs: ["artifact"],
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
        { category: "assist", confirm: "never", needs: ["artifact"], usage: { text: 1 } },
    ),
    "generate-theme": meta(
        "generate-theme",
        "Generate theme",
        "Create a theme from a prompt",
        "action",
        AGENT_DIRECT,
        { category: "theme", live: true, confirm: "never", usage: { theme: 1 } },
    ),
    // Free in itself: it sources a picture the way the run does, so stock costs nothing and an AI
    // picture is counted by the turn that made it, the same as one landing in a fresh section.
    reimage: meta(
        "reimage",
        "Replace an image",
        "Re-source a section's image or backdrop from a new description",
        "action",
        ["agent"],
        { category: "media", free: true, confirm: "after", needs: ["artifact"] },
    ),
    // direct only: the agent re-sources through reimage, which places the picture as well
    "generate-image": meta(
        "generate-image",
        "Generate image",
        "Create an image with AI",
        "action",
        ["direct"],
        {
            category: "media",
            live: true,
            usage: { image: 1 },
            meter: (m) => ({ image: Math.max(1, m.variations ?? 1) }),
        },
    ),
    // direct-only: a chat turn should not be able to spend 100 credits a call
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
        { category: "assist", confirm: "never", needs: ["artifact"], usage: { reply: 1 } },
    ),
    "write-alt-text": meta(
        "write-alt-text",
        "Write alt text",
        "Write alt text for an image",
        "action",
        AGENT_DIRECT,
        { category: "assist", confirm: "after", needs: ["artifact"], usage: { text: 1 } },
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
            confirm: "after",
            needs: ["artifact"],
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
        {
            category: "assist",
            live: true,
            confirm: "never",
            needs: ["artifact"],
            usage: { reply: 1 },
        },
    ),
    "show-sections": meta(
        "show-sections",
        "Show sections",
        "Display the existing sections as a carousel",
        "action",
        OVER_MCP,
        { effect: "read", free: true, confirm: "never", needs: ["artifact"] },
    ),
    "find-artifacts": meta(
        "find-artifacts",
        "Find artifacts",
        "Search the user's library by title or topic",
        "action",
        OVER_MCP,
        { effect: "read", free: true, confirm: "never", needs: ["library"] },
    ),
    "read-artifact": meta(
        "read-artifact",
        "Read artifact",
        "Load one artifact's content to summarize or edit it",
        "action",
        OVER_MCP,
        { effect: "read", free: true, confirm: "never", needs: ["library"] },
    ),
    "rename-artifact": meta(
        "rename-artifact",
        "Rename artifact",
        "Rename an artifact",
        "action",
        OVER_MCP,
        {
            effect: "write",
            free: true,
            confirm: "never",
            needs: ["library"],
            without: ["generation"],
        },
    ),
    "move-artifact": meta(
        "move-artifact",
        "Move artifact",
        "Move an artifact into a folder (or out)",
        "action",
        OVER_MCP,
        {
            effect: "write",
            free: true,
            confirm: "never",
            needs: ["library"],
            without: ["generation"],
        },
    ),
    "duplicate-artifact": meta(
        "duplicate-artifact",
        "Duplicate artifact",
        "Make a copy of an artifact",
        "action",
        ["agent", "direct"],
        { free: true, confirm: "never", needs: ["library"], without: ["generation"] },
    ),
    "trash-artifact": meta(
        "trash-artifact",
        "Trash artifact",
        "Move an artifact to Trash",
        "action",
        OVER_MCP,
        {
            effect: "destructive",
            free: true,
            confirm: "before",
            needs: ["library"],
            without: ["generation"],
        },
    ),
    "restore-artifact": meta(
        "restore-artifact",
        "Restore artifact",
        "Restore an artifact from Trash",
        "action",
        OVER_MCP,
        // the trash pair travels together: whoever may move something there may bring it back
        {
            effect: "write",
            scope: "artifacts:delete",
            free: true,
            confirm: "never",
            needs: ["library"],
            without: ["generation"],
        },
    ),
    "create-folder": meta(
        "create-folder",
        "Create folder",
        "Make a new folder",
        "action",
        ["agent", "direct"],
        { free: true, confirm: "never", needs: ["library"], without: ["generation"] },
    ),
    "share-artifact": meta(
        "share-artifact",
        "Share artifact",
        "Open the share options for an artifact",
        "action",
        ["agent", "direct"],
        // Handing a document to people outside the workspace is its own permission, not a write.
        // No `requires`: the tool opens the share panel rather than creating a link, and the panel
        // is where the plan's own limits are explained.
        {
            scope: "artifacts:share",
            free: true,
            confirm: "never",
            needs: ["library"],
            without: ["generation"],
        },
    ),
    "export-artifact": meta(
        "export-artifact",
        "Export artifact",
        "Open an artifact to export it",
        "action",
        ["agent", "direct"],
        { free: true, confirm: "never", needs: ["library"], without: ["generation"] },
    ),
    "create-artifact": meta(
        "create-artifact",
        "Create artifact",
        "Store a piece whose content is already known, with no generation",
        "action",
        OVER_MCP,
        {
            effect: "write",
            live: true,
            free: true,
            confirm: "before",
            needs: ["library"],
            without: ["generation"],
        },
    ),
    "list-workspaces": meta(
        "list-workspaces",
        "List workspaces",
        "The workspaces this account can reach, and which one is used by default",
        "action",
        OVER_MCP,
        { effect: "read", live: true, free: true, confirm: "never", needs: ["library"] },
    ),
    "find-templates": meta(
        "find-templates",
        "Find templates",
        "List the starter templates",
        "action",
        OVER_MCP,
        {
            effect: "read",
            public: true,
            free: true,
            confirm: "never",
            needs: ["library"],
            without: ["generation"],
        },
    ),
    // Only the branch that needs the model: a text layer, a docx or a spreadsheet is parsed locally
    // and stays free. Priced as one reply because the shape is the same, a whole document in and
    // notes out, and the settle bills the real tokens whatever the page count turns out to be.
    "read-file": meta(
        "read-file",
        "Read a file",
        "Read an image or a scanned document that has no text layer",
        "action",
        ["direct"],
        { category: "assist", live: true, usage: { reply: 1 } },
    ),
    "plan-section": meta(
        "plan-section",
        "Plan section",
        "Decide one section's grid + per-cell blocks",
        "primitive",
        INTERNAL,
        // internal: composed inside a generation run, whose reserve already meters these calls
        { free: true },
    ),
    "search-context": meta(
        "search-context",
        "Search the attached contexts",
        "Retrieve passages from the conversation's attached context collections",
        "action",
        ["agent"],
        // agent-only, so it always runs under the turn's own reserve: the retrieval's embedding
        // spend lands in that turn's meter and is billed there
        { live: true, free: true, confirm: "never", needs: ["contexts"] },
    ),
    "write-section": meta(
        "write-section",
        "Write section",
        "Write the content that fills a planned grid",
        "primitive",
        INTERNAL,
        // internal: the parent run holds for the sections it writes
        { free: true },
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
};

// only tools that are BOTH priced (usage) and live, so no unbuyable prices
export const PRICED_TOOLS: ToolMeta[] = Object.values(TOOLS).filter((t) => t.usage && t.live);

/** Needs no account: callable before a client has a token at all. */
export const isPublicTool = (id: ToolId): boolean => TOOLS[id]?.public === true;

export const confirmFor = (id: ToolId): ToolConfirm => TOOLS[id].confirm ?? "never";

/** Whether the agent is offered a tool, given what its context holds. */
export const availableTo = (id: ToolId, has: ReadonlySet<ToolNeed>): boolean => {
    const def = TOOLS[id];
    return (
        (def.needs ?? []).every((n) => has.has(n)) && !(def.without ?? []).some((n) => has.has(n))
    );
};

// The permission one call needs. `effect` answers three of the four, and a tool whose scope it
// cannot express declares one. The fallback leans restrictive on purpose: a tool that says nothing
// at all lands on write, never on read, so forgetting to annotate cannot widen a token's reach.
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

// creditsForUsd floors at 1 so a real call is never billed nothing; free has to reach zero, or
// every unpriced tool would quietly cost a credit. `free` is the declared answer and the missing
// price is the fallback, so forgetting one cannot mis-bill; check:tools is what makes the
// declaration mandatory for any tool with a body.
const isFree = (id: ToolId): boolean =>
    TOOLS[id].free === true || (!TOOLS[id].usage && !TOOLS[id].meter);

// The same formula the settle uses, on the units the run is expected to produce, so an estimate and
// the charge it precedes cannot disagree about what an action costs.
const priceOf = (usage: Usage, prices: UnitPrices): number =>
    creditsForUsd(usdOfUsage(usage, prices));

// what a run typically costs: the number the UI previews and the credits table lists
export function estimateCost(
    id: ToolId,
    m?: MeterParams,
    prices: UnitPrices = DEFAULT_UNIT_PRICES,
): number {
    return isFree(id) ? 0 : priceOf(usageFor(id, m), prices);
}

// what the pre-flight gate holds, which is the estimate unless the tool declares a ceiling
export function reserveCost(
    id: ToolId,
    m?: MeterParams,
    prices: UnitPrices = DEFAULT_UNIT_PRICES,
): number {
    const ceiling = TOOLS[id].ceiling;
    return ceiling && !isFree(id) ? priceOf(ceiling, prices) : estimateCost(id, m, prices);
}

// what a free doorway must see affordable before it opens; zero for everything ungated
export function gateCost(id: ToolId, prices: UnitPrices = DEFAULT_UNIT_PRICES): number {
    const gate = TOOLS[id].gate;
    return gate ? priceOf(gate, prices) : 0;
}

// headline cost, ignoring job size
export function typicalCost(id: ToolId, prices: UnitPrices = DEFAULT_UNIT_PRICES): number {
    return isFree(id) ? 0 : priceOf(TOOLS[id].usage ?? {}, prices);
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
export function costRange(
    id: ToolId,
    prices: UnitPrices = DEFAULT_UNIT_PRICES,
): { min: number; max: number } {
    const t = TOOLS[id];
    if (!t.meter) {
        const c = typicalCost(id, prices);
        return { min: c, max: c };
    }
    return { min: priceOf(t.meter(SMALL), prices), max: priceOf(t.meter(LARGE), prices) };
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
    mustInclude: z.array(z.string()).optional().describe("points the piece has to cover"),
    contextIds: z.array(z.string()).optional(),
    source: z.string().optional().describe("material to build from, pasted in"),
    sourceArtifactId: z
        .string()
        .optional()
        .describe("repurpose an existing artifact, by id, into this new one"),
    shapeTemplateId: z
        .string()
        .optional()
        .describe("a starter whose section shapes the outline follows; never its words"),
    imageSource: z
        .enum(["stock", "ai"])
        .optional()
        .describe("stock photos are free; AI images are metered per picture"),
});

const zGenerationId = z.string().describe("the generation id, from start-generation");
// a write against an outline the brief has moved past is refused unless the caller says so
const zForce = z
    .boolean()
    .optional()
    .describe(
        "write against the current outline even though the brief changed after it was planned",
    );

const zBeatFields = {
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
    layout: z.string().optional().describe("full · split-6040 · split-4060 · two-col · three-up"),
    blocks: z
        .array(z.string())
        .optional()
        .describe("the block leading each column, in order; derived from the layout when omitted"),
    image: z.boolean().optional().describe("leads with a full-bleed image"),
};

// the envelope the route already checked; the chat runtime reads the rest
export const isChatInput = (v: unknown): v is ChatInput =>
    !!v &&
    typeof v === "object" &&
    typeof (v as ChatInput).message === "string" &&
    !!(v as ChatInput).context &&
    typeof (v as ChatInput).context === "object";

const isPatch = (v: unknown): v is Patch =>
    !!v &&
    typeof v === "object" &&
    ["artifact", "generation", "workspace"].some((k) => k in (v as object));

// What the agent is told about a tool and what it accepts. Server-only and bulky (long prose,
// zod schemas), so it sits beside TOOLS rather than inside it: a client importing this module for
// a cost estimate tree-shakes all of it away.
export interface ToolSpec {
    describe: string;
    input: ZodType;
    // What the tool answers with, for the surfaces that publish a contract (MCP's `outputSchema`,
    // the REST listing). Structural rather than exhaustive: the top-level shape a client keys on,
    // with the content trees left open the way the section schema leaves `data` open.
    output?: ZodType;
}

// The answer shapes the delegated surfaces publish. A section or an artifact is described to its
// envelope only: the element tree inside is the engine's contract, taught by the catalog, not a
// schema a client should validate against.
const zSectionOut = z.looseObject({
    id: z.string(),
    root: z.looseObject({ type: z.string(), data: z.record(z.string(), z.unknown()) }),
});
const zContentOut = z.looseObject({
    format: z.string(),
    theme: z.string(),
    sections: z.array(zSectionOut),
});
const zBeatOut = z.looseObject({ id: z.string(), label: z.string(), role: z.string() });
const zGenerationOut = z.looseObject({
    id: z.string(),
    workspaceId: z.string(),
    artifactId: z.string(),
    stage: z.enum(["briefed", "planning", "outlined", "writing", "done"]),
    brief: z.looseObject({ prompt: z.string(), surface: z.string(), theme: z.string() }),
    briefVersion: z.number(),
    outline: z.looseObject({ title: z.string(), beats: z.array(zBeatOut) }).nullable(),
    plannedAgainst: z.number().nullable(),
    steer: z.string(),
    clarify: z.string().nullable(),
    beats: z.record(
        z.string(),
        z.looseObject({
            status: z.enum(["queued", "done", "failed", "skipped"]),
            versions: z.array(zSectionOut),
            active: z.number(),
        }),
    ),
    seq: z.number(),
    createdAt: z.string(),
});
const zOutlineOut = z.looseObject({
    title: z.string(),
    backdrop: z.string(),
    beats: z.array(zBeatOut),
});
const zStructureEdit = z.object({
    summary: z.string(),
    patch: z.looseObject({}),
});
const zAction = <K extends string>(kind: K, extra: Record<string, ZodType> = {}) =>
    z.looseObject({ kind: z.literal(kind), id: z.string(), ...extra });
const zRefs = z.array(z.looseObject({ id: z.string(), title: z.string(), format: z.string() }));

export const TOOL_SPEC = {
    "start-generation": {
        output: zGenerationOut,
        describe:
            "Start a NEW piece from a brief. It opens the generation and its draft; nothing is planned or written until plan-outline and write-beats run, so the user gets to shape the outline first. Distill the conversation to ONE tight, specific sentence: subject, angle, audience. When the user pastes material to build FROM, put it in `source`. To repurpose one of their existing artifacts, pass its id as `sourceArtifactId`.",
        input: zBrief.extend({
            artifactId: z
                .string()
                .optional()
                .describe("extend an existing artifact instead of starting a new draft"),
        }),
    },
    "plan-outline": {
        output: zOutlineOut,
        describe:
            "Plan the outline of a generation from its brief: title, backdrop, and the ordered beats with the job each one does. Call it again to REPLAN from scratch when the user wants a genuinely different arc; an adjustment to existing beats is revise-outline. It refuses once sections are written.",
        input: z.object({ generationId: zGenerationId }),
    },
    "revise-brief": {
        output: z.object({ fields: z.array(z.string()) }),
        describe:
            "Change the brief a generation is planned against: its goal, audience, tone, the points it must cover, its length, format or image source. Use it when the user re-frames the piece ('make it for investors instead', 'it has to cover pricing') or when they ask for a different reading of the same prompt. Only the fields you pass change. The outline is then out of date until plan-outline runs again; say so.",
        input: z.object({
            generationId: zGenerationId,
            prompt: z.string().optional(),
            goal: z.string().optional(),
            audience: z.string().optional(),
            tone: z.string().optional(),
            mustInclude: z.array(z.string()).optional(),
            clarifications: z
                .array(z.string())
                .optional()
                .describe("answers and shaping notes the planner should treat as settled"),
            length: z.enum(["Short", "Standard", "In-depth"]).optional(),
            surface: z.enum(["deck", "doc", "web"]).optional(),
            imageSource: z.enum(["stock", "ai"]).optional(),
        }),
    },
    "revise-outline": {
        output: z.object({ summary: z.string(), ops: z.array(z.looseObject({ op: z.string() })) }),
        describe:
            "Revise the OUTLINE of a generation: add a beat, remove one, move one, or rewrite what a beat must say. Use this for anything structural or about intent. Beats not yet written are free to change; changing a written beat only updates the plan, so say that rewriting the section itself is the next step. Write real substance (claims, numbers, comparisons), never topic labels.",
        input: z.object({
            generationId: zGenerationId,
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
                        ...zBeatFields,
                    }),
                )
                .min(1),
        }),
    },
    "steer-generation": {
        output: z.object({ note: z.string() }),
        describe:
            "Set the standing note that every section STILL TO BE WRITTEN must follow — tone, angle, emphasis, a constraint to respect. Use it when the user asks for something to hold across the rest of the run ('keep the rest short', 'more concrete numbers from here'), rather than a change to one beat. It does not touch sections already written; rewrite those instead. Pass an empty note to drop the current one.",
        input: z.object({
            generationId: zGenerationId,
            note: z
                .string()
                .describe(
                    "the instruction to hold for the rest of the run; empty string clears it",
                ),
        }),
    },
    "write-beat": {
        output: zSectionOut,
        describe:
            "Write ONE planned beat of a generation into a real section, or rework one that is already written. This is how a single planned section becomes content ('write the cover', 'redo section 3 with more numbers'). Pass `note` for a rework and `replace: true` when the beat already has a section. Never use add-section for a beat that is in the outline.",
        input: z.object({
            generationId: zGenerationId,
            beatId: z.string().describe("the outline beat id, e.g. s2"),
            note: z
                .string()
                .optional()
                .describe("for a rework: what to change versus the previous take"),
            replace: z
                .boolean()
                .optional()
                .describe("true when the beat is already written and this is a new take"),
            force: zForce,
        }),
    },
    "write-beats": {
        output: z.object({ written: z.array(z.string()), failed: z.array(z.string()) }),
        describe:
            "Write the planned beats of a generation into real sections, in order. This is what 'write sections 2 to 5', 'generate the rest', and 'build the whole thing' mean once an outline exists. Omit `beatIds` to write every beat not yet written. Each section is priced; the user approves before it starts.",
        input: z.object({
            generationId: zGenerationId,
            beatIds: z
                .array(z.string())
                .optional()
                .describe("the beat ids to write, in order; omit for every unwritten beat"),
            force: zForce,
        }),
    },
    "pick-version": {
        output: zSectionOut,
        describe:
            "Make one take of a reworked section the one the piece carries. `index` is 0 for the first take.",
        input: z.object({
            generationId: zGenerationId,
            beatId: z.string(),
            index: z.number().int().min(0),
        }),
    },
    "read-generation": {
        output: z.object({
            generation: zGenerationOut,
            content: zContentOut,
            writing: z.boolean(),
        }),
        describe:
            "Read a generation: its brief, its outline with what each beat is meant to say, the standing note, and which sections are written. Call it when you need the current plan before changing it.",
        input: z.object({ generationId: zGenerationId }),
    },
    "finish-generation": {
        output: z.object({ skipped: z.array(z.string()) }),
        describe:
            "Close a generation once the user is done writing: beats still queued are skipped and the piece is recorded as made. Use it for 'that's enough', 'skip the rest', or when every beat is written.",
        input: z.object({ generationId: zGenerationId }),
    },
    "apply-patch": {
        describe:
            "Apply a change you already proposed and the user has now approved in words ('yes', 'go ahead', 'do it'). Name the pending card by its id from the list of pending proposals. Never invent one; if nothing is pending, propose the change again instead.",
        input: z.object({
            generationId: z.string().optional(),
            proposal: z.string().optional().describe("the id of the pending proposal to apply"),
            patch: z
                .custom<Patch>(isPatch)
                .optional()
                .describe("a literal patch, for a caller that holds one"),
        }),
    },
    "ask-assistant": {
        describe: "One turn of the chat agent over the caller's message and context.",
        input: z.custom<ChatInput>(isChatInput),
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
    "add-section": {
        output: zSectionOut,
        describe:
            "Generate ONE new section for the open artifact and return it for insertion. Only for a section that is not in any outline; a planned beat is written with write-beat. afterId = the section id it should follow (null = at the end).",
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
        output: z.object({
            artifactId: z.string(),
            section: zSectionOut,
            theme: z.string(),
            format: z.string(),
        }),
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
        output: zRefs,
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
            "Make one or more AI images from a description and store them in the workspace library. `prompt` describes the picture itself, not an instruction ('a quiet studio at dusk, warm light', not 'make me a photo'). Pass `ref` (an existing image url or asset id) to refine that image instead of starting fresh — then `prompt` reads as the change you want.",
        input: z.object({
            prompt: z.string().describe("what the picture shows"),
            aspect: z
                .string()
                .optional()
                .describe("width:height, e.g. 16:9 (the default), 1:1, 3:4"),
            variations: z.number().int().min(1).max(4).optional().describe("how many, 1 to 4"),
            style: z.enum(["photo", "illustration", "3d", "line", "watercolor"]).optional(),
            ref: z
                .string()
                .optional()
                .describe(
                    "an image to refine rather than replace, by url or asset id; usually left unset",
                ),
        }),
    },
    "generate-video": {
        describe: "Render one short AI video clip from a description and store it in the library.",
        input: z.object({
            prompt: z.string().describe("what the clip shows, one continuous shot"),
            aspect: z.enum(["16:9", "9:16"]).optional(),
        }),
    },
    "read-file": {
        describe: "Read the text out of an image or a scanned page that has no text layer.",
        input: z.object({
            mime: z.string(),
            data: z.string().describe("the file, base64"),
        }),
    },
    "compose-soundtrack": {
        describe:
            "A music bed: a house preset by id, one written for a description, or one written for the open piece (`custom`).",
        input: z.object({
            preset: z.string().optional(),
            description: z.string().optional(),
            custom: z.boolean().optional(),
            lengthMs: z.number().optional(),
        }),
    },
    "audition-voice": {
        describe: "Hear a voice from the workspace shelf read one short line.",
        input: z.object({
            voiceId: z.string().optional().describe("a shelf voice; the default when omitted"),
            text: z.string().optional(),
        }),
    },
    "design-voice": {
        describe:
            "Generate voice candidates from a written description; nothing is kept until one is chosen.",
        input: z.object({
            description: z.string(),
            sampleText: z.string().optional(),
        }),
    },
    "create-artifact": {
        output: z.object({ title: z.string(), sections: z.number() }),
        describe:
            "Store a deck, doc or site whose content you already have, exactly as given. Nothing is generated and nothing is charged, so this is the one to use when the content comes from somewhere else. To make something from a brief instead, use start-generation.",
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
        output: z.array(
            z.looseObject({
                id: z.string(),
                name: z.string(),
                role: z.string(),
                isDefault: z.boolean(),
            }),
        ),
        describe:
            "List the workspaces this connection can act in, with the role held in each and which one is used when a call does not name one. Call it when the person asks where something lives, or before acting somewhere other than the default.",
        input: z.object({}),
    },
    "find-templates": {
        output: z.array(z.looseObject({ id: z.string(), name: z.string() })),
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
        output: z.object({
            id: z.string(),
            generationId: z.string(),
            title: z.string(),
            sections: z.number(),
            format: z.string(),
        }),
        describe:
            "Build a whole deck, doc, or site from a brief in one call — plans an outline, then writes every section in order. Can build FROM source material (pasted text via `source`, or an existing artifact via `sourceArtifactId`).",
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
        output: zAction("move"),
        describe:
            "Move an artifact into a folder, or out of one. artifactId = its id; folderId = the target folder id (from the workspace's folder list), or null to remove it from any folder.",
        input: z.object({
            artifactId: z.string(),
            folderId: z.string().nullable().describe("target folder id, or null for no folder"),
        }),
    },
    "read-artifact": {
        output: z.string(),
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
        output: zStructureEdit,
        describe:
            "Remove a section from the current artifact. sectionId = the section to delete; label = its short heading, for the summary.",
        input: z.object({
            sectionId: z.string(),
            label: z.string().optional().describe("the section's heading, for the summary"),
        }),
    },
    "rename-artifact": {
        output: zAction("rename", { title: z.string() }),
        describe:
            "Rename one of the user's artifacts. artifactId = its id (from find-artifacts); title = the new title.",
        input: z.object({
            artifactId: z.string(),
            title: z.string().describe("the new title"),
        }),
    },
    "reorder-section": {
        output: zStructureEdit,
        describe:
            "Move a section to a new position in the current artifact. sectionId = the section to move; afterId = the id of the section it should follow, or null to move it to the front. label = its short heading, for the summary.",
        input: z.object({
            sectionId: z.string(),
            afterId: z.string().nullable(),
            label: z.string().optional().describe("the section's heading, for the summary"),
        }),
    },
    "restore-artifact": {
        output: zAction("restore"),
        describe: "Restore an artifact from Trash back into the library. artifactId = its id.",
        input: z.object({ artifactId: z.string() }),
    },
    "revise-element": {
        output: zSectionOut,
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
        output: zSectionOut,
        describe:
            "Rewrite an existing section to satisfy an instruction and return the revised section. sectionId = the id from the section map.",
        input: z.object({
            sectionId: z.string().describe("the id of the section to rewrite"),
            instruction: z.string().describe("what to change about it"),
        }),
    },
    "rewrite-text": {
        describe:
            "Rewrite ONE passage of text per an instruction (make it punchier, shorter, longer, more formal, fix grammar, …). Returns just the rewritten text. For words that live in the artifact use rewrite-passage or rewrite-section instead.",
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
        output: zStructureEdit,
        describe:
            "Re-render the current artifact in a different format — deck (slides), doc (a document), or web (a page). The content is the same; only the layout changes.",
        input: z.object({ format: z.enum(["deck", "doc", "web"]) }),
    },
    "set-theme": {
        output: zStructureEdit,
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
        output: z.array(z.object({ id: z.string(), text: z.string() })),
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
            guidance: z
                .string()
                .optional()
                .describe("how the presenter should sound, when the user said"),
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
        output: zAction("trash"),
        describe:
            "Move an artifact to Trash (recoverable). artifactId = its id. Use only when the user clearly wants to delete/remove it — the user still confirms before it happens.",
        input: z.object({ artifactId: z.string() }),
    },
} satisfies Partial<Record<ToolId, ToolSpec>>;

/** A tool's input type, taken from its definition so an implementation cannot disagree with it. */
export type ToolInput<Id extends ToolId> = Id extends keyof typeof TOOL_SPEC
    ? z.infer<(typeof TOOL_SPEC)[Id]["input"]>
    : never;
