// The model registry + resolver — the single place model choice lives. Pipeline stages reference a
// ROLE (planner/writer/editor/chat/intake); resolveModel() maps (role, quality) → a registry key,
// honoring env overrides. Swap a model here (or via env) without touching a stage. The registry spans
// providers; the LLM layer resolves the key → the provider's real model.

export type Provider = "anthropic" | "openai" | "google" | "xai" | "cohere";
export type ModelTier = "frontier+" | "frontier" | "balanced" | "fast";

export interface ModelDef {
    id: string; // the provider's real model id, as its SDK expects
    provider: Provider;
    label: string;
    tier: ModelTier;
    contextTokens: number;
}

// Registry keyed by a stable short name (what stages + env overrides reference); `id` is the wire id.
export const MODELS: Record<string, ModelDef> = {
    // Anthropic
    "claude-fable-5": {
        id: "claude-fable-5",
        provider: "anthropic",
        label: "Fable 5",
        tier: "frontier+",
        contextTokens: 1_000_000,
    },
    "claude-opus-4-8": {
        id: "claude-opus-4-8",
        provider: "anthropic",
        label: "Opus 4.8",
        tier: "frontier",
        contextTokens: 1_000_000,
    },
    "claude-sonnet-5": {
        id: "claude-sonnet-5",
        provider: "anthropic",
        label: "Sonnet 5",
        tier: "balanced",
        contextTokens: 1_000_000,
    },
    "claude-haiku-4-5": {
        id: "claude-haiku-4-5-20251001",
        provider: "anthropic",
        label: "Haiku 4.5",
        tier: "fast",
        contextTokens: 200_000,
    },
    // OpenAI
    "gpt-4o": {
        id: "gpt-4o",
        provider: "openai",
        label: "GPT-4o",
        tier: "frontier",
        contextTokens: 128_000,
    },
    "gpt-4o-mini": {
        id: "gpt-4o-mini",
        provider: "openai",
        label: "GPT-4o mini",
        tier: "fast",
        contextTokens: 128_000,
    },
    // Google
    "gemini-2.5-flash": {
        id: "gemini-2.5-flash",
        provider: "google",
        label: "Gemini 2.5 Flash",
        tier: "balanced",
        contextTokens: 1_000_000,
    },
    "gemini-2.5-pro": {
        id: "gemini-2.5-pro",
        provider: "google",
        label: "Gemini 2.5 Pro",
        tier: "frontier",
        contextTokens: 2_000_000,
    },
    // xAI
    "grok-3": {
        id: "grok-3",
        provider: "xai",
        label: "Grok 3",
        tier: "balanced",
        contextTokens: 131_072,
    },
    // Cohere
    "command-a": {
        id: "command-a-03-2025",
        provider: "cohere",
        label: "Command A",
        tier: "balanced",
        contextTokens: 256_000,
    },
};

export type Role = "planner" | "writer" | "editor" | "chat" | "intake";
export type Quality = "auto" | "best" | "balanced" | "fast";

const DEFAULT_MODEL = "claude-opus-4-8";

// role × quality → registry key. The default (`auto`) keeps a strong PLANNER (the outline drives the whole
// artifact's organization) but a fast WRITER — per-section copy doesn't need frontier reasoning, and Haiku
// benchmarks ~35% faster than Opus while writing the same schema reliably. `best` trades speed for depth.
// (Sonnet is deliberately absent from the defaults: it fails the constrained section schema — see bench.)
const TABLE: Record<Quality, Record<Role, string>> = {
    auto: {
        planner: "claude-opus-4-8",
        writer: "claude-haiku-4-5",
        editor: "claude-opus-4-8",
        chat: "claude-opus-4-8",
        intake: "claude-haiku-4-5",
    },
    best: {
        planner: "claude-fable-5",
        writer: "claude-opus-4-8",
        editor: "claude-opus-4-8",
        chat: "claude-opus-4-8",
        intake: "claude-haiku-4-5",
    },
    balanced: {
        planner: "claude-opus-4-8",
        writer: "claude-haiku-4-5",
        editor: "claude-haiku-4-5",
        chat: "claude-haiku-4-5",
        intake: "claude-haiku-4-5",
    },
    fast: {
        planner: "claude-haiku-4-5",
        writer: "claude-haiku-4-5",
        editor: "claude-haiku-4-5",
        chat: "claude-haiku-4-5",
        intake: "claude-haiku-4-5",
    },
};

// env override: GALLEO_MODEL_<ROLE> (e.g. GALLEO_MODEL_PLANNER=gpt-4o) wins for that role.
const envOverride = (role: Role): string | undefined => {
    const v = process.env[`GALLEO_MODEL_${role.toUpperCase()}`];
    return v && MODELS[v] ? v : undefined;
};

export function resolveModel(role: Role, opts?: { quality?: Quality }): string {
    return envOverride(role) ?? TABLE[opts?.quality ?? "auto"][role] ?? DEFAULT_MODEL;
}
