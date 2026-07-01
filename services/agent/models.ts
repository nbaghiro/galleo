// The model registry + resolver — the single place model choice lives. Pipeline stages reference a
// ROLE (planner/writer/editor/chat/intake), and resolveModel() maps (role, quality) → an exact model id,
// honoring env overrides. Swap a model here (or via env) without touching any stage. (See
// .docs/design/agent-backend.md §5.)

export type ModelTier = "frontier+" | "frontier" | "balanced" | "fast";

export interface ModelDef {
    id: string;
    label: string;
    tier: ModelTier;
    inputPer1M: number; // USD per 1M input tokens
    outputPer1M: number; // USD per 1M output tokens
    contextTokens: number;
}

export const MODELS: Record<string, ModelDef> = {
    "claude-fable-5": {
        id: "claude-fable-5",
        label: "Fable 5",
        tier: "frontier+",
        inputPer1M: 10,
        outputPer1M: 50,
        contextTokens: 1_000_000,
    },
    "claude-opus-4-8": {
        id: "claude-opus-4-8",
        label: "Opus 4.8",
        tier: "frontier",
        inputPer1M: 5,
        outputPer1M: 25,
        contextTokens: 1_000_000,
    },
    "claude-sonnet-4-6": {
        id: "claude-sonnet-4-6",
        label: "Sonnet 4.6",
        tier: "balanced",
        inputPer1M: 3,
        outputPer1M: 15,
        contextTokens: 1_000_000,
    },
    "claude-haiku-4-5": {
        id: "claude-haiku-4-5",
        label: "Haiku 4.5",
        tier: "fast",
        inputPer1M: 1,
        outputPer1M: 5,
        contextTokens: 200_000,
    },
};

export type Role = "planner" | "writer" | "editor" | "chat" | "intake";
export type Quality = "auto" | "best" | "balanced" | "fast";

const DEFAULT_MODEL = "claude-opus-4-8";

// role × quality → model id. `auto` defaults to Opus 4.8 everywhere (Anthropic's guidance: don't silently
// downgrade for cost). The cheaper mixes are opt-in tiers.
const TABLE: Record<Quality, Record<Role, string>> = {
    auto: {
        planner: "claude-opus-4-8",
        writer: "claude-opus-4-8",
        editor: "claude-opus-4-8",
        chat: "claude-opus-4-8",
        intake: "claude-opus-4-8",
    },
    best: {
        planner: "claude-fable-5",
        writer: "claude-opus-4-8",
        editor: "claude-opus-4-8",
        chat: "claude-opus-4-8",
        intake: "claude-sonnet-4-6",
    },
    balanced: {
        planner: "claude-opus-4-8",
        writer: "claude-sonnet-4-6",
        editor: "claude-sonnet-4-6",
        chat: "claude-sonnet-4-6",
        intake: "claude-haiku-4-5",
    },
    fast: {
        planner: "claude-sonnet-4-6",
        writer: "claude-haiku-4-5",
        editor: "claude-haiku-4-5",
        chat: "claude-sonnet-4-6",
        intake: "claude-haiku-4-5",
    },
};

// env override: GALLEO_MODEL_<ROLE> (e.g. GALLEO_MODEL_PLANNER=claude-fable-5) wins for that role.
const envOverride = (role: Role): string | undefined => {
    const v = process.env[`GALLEO_MODEL_${role.toUpperCase()}`];
    return v && MODELS[v] ? v : undefined;
};

export function resolveModel(role: Role, opts?: { quality?: Quality }): string {
    return envOverride(role) ?? TABLE[opts?.quality ?? "auto"][role] ?? DEFAULT_MODEL;
}
