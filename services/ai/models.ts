import type { ModelTier } from "@model/billing";
import { out } from "../log";

export type Provider = "anthropic" | "openai" | "google" | "xai";

export const PROVIDER_LABEL: Record<Provider, string> = {
    google: "Google",
    anthropic: "Anthropic",
    openai: "OpenAI",
    xai: "xAI",
};

// Google leads: every task defaults there, so the list opens on what is already selected.
export const PROVIDER_ORDER: readonly Provider[] = ["google", "anthropic", "openai", "xai"];

export type AiTask =
    | "generate"
    | "brief"
    | "outline"
    | "section"
    | "edit"
    | "rewrite"
    | "translate"
    | "chat"
    | "theme";

export const AI_TASKS: readonly AiTask[] = [
    "generate",
    "brief",
    "outline",
    "section",
    "edit",
    "rewrite",
    "translate",
    "chat",
    "theme",
];

export interface ModelInfo {
    id: string;
    provider: Provider;
    model: string; // the provider's own model id
    label: string;
    contextWindow: number;
    json: boolean; // reliable structured / JSON output (generateObject)
    vision: boolean;
    // Claude 4.7+ rejects temperature/top_p/top_k with a 400; see samplingFor()
    sampling?: false;
}

export const MODELS: readonly ModelInfo[] = [
    {
        id: "anthropic:claude-fable-5",
        provider: "anthropic",
        model: "claude-fable-5",
        label: "Claude Fable 5",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        sampling: false,
    },
    {
        id: "anthropic:claude-opus-5",
        provider: "anthropic",
        model: "claude-opus-5",
        label: "Claude Opus 5",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        sampling: false,
    },
    {
        id: "anthropic:claude-opus-4-8",
        provider: "anthropic",
        model: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        sampling: false,
    },
    {
        id: "anthropic:claude-sonnet-5",
        provider: "anthropic",
        model: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        sampling: false,
    },
    {
        id: "anthropic:claude-haiku-4-5",
        provider: "anthropic",
        model: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        contextWindow: 200_000,
        json: true,
        vision: true,
    },
    {
        id: "openai:gpt-5.5",
        provider: "openai",
        model: "gpt-5.5",
        label: "GPT-5.5",
        contextWindow: 400_000,
        json: true,
        vision: true,
        sampling: false,
    },
    {
        id: "openai:gpt-5.4",
        provider: "openai",
        model: "gpt-5.4",
        label: "GPT-5.4",
        contextWindow: 400_000,
        json: true,
        vision: true,
        sampling: false,
    },
    {
        id: "openai:gpt-5.4-mini",
        provider: "openai",
        model: "gpt-5.4-mini",
        label: "GPT-5.4 mini",
        contextWindow: 400_000,
        json: true,
        vision: true,
        sampling: false,
    },
    {
        id: "openai:gpt-5.4-nano",
        provider: "openai",
        model: "gpt-5.4-nano",
        label: "GPT-5.4 nano",
        contextWindow: 400_000,
        json: true,
        vision: true,
        sampling: false,
    },
    {
        id: "google:gemini-2.5-pro",
        provider: "google",
        model: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
    },
    {
        id: "google:gemini-2.5-flash",
        provider: "google",
        model: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
    },
    {
        id: "google:gemini-3.5-flash",
        provider: "google",
        model: "gemini-3.5-flash",
        label: "Gemini 3.5 Flash",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
    },
    {
        id: "google:gemini-3.1-flash-lite-preview",
        provider: "google",
        model: "gemini-3.1-flash-lite-preview",
        label: "Gemini 3.1 Flash Lite (preview)",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
    },
    {
        id: "google:gemini-3.1-pro-preview",
        provider: "google",
        model: "gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro (preview)",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
    },
    {
        id: "xai:grok-4.3",
        provider: "xai",
        model: "grok-4.3",
        label: "Grok 4.3",
        contextWindow: 256_000,
        json: true,
        vision: true,
    },
    {
        id: "xai:grok-4.20-reasoning",
        provider: "xai",
        model: "grok-4.20-reasoning",
        label: "Grok 4.20 (reasoning)",
        contextWindow: 256_000,
        json: true,
        vision: true,
    },
    {
        id: "xai:grok-4.20-non-reasoning",
        provider: "xai",
        model: "grok-4.20-non-reasoning",
        label: "Grok 4.20 (fast)",
        contextWindow: 256_000,
        json: true,
        vision: true,
    },
] as const;

export const MODELS_BY_ID: Record<string, ModelInfo> = Object.fromEntries(
    MODELS.map((m) => [m.id, m]),
);

export function getModel(id: string): ModelInfo | undefined {
    return MODELS_BY_ID[id];
}

// one model for every task: 3.5-flash won the chat tool-routing eval (100% vs 2.5-pro's 80%) at
// lower latency; the per-task entries stay so one job can be retuned in isolation
const FLASH = "google:gemini-3.5-flash";

export const DEFAULT_MODELS: Record<AiTask, string> = {
    generate: FLASH,
    brief: FLASH,
    outline: FLASH,
    section: FLASH,
    edit: FLASH,
    rewrite: FLASH,
    translate: FLASH,
    chat: FLASH,
    theme: FLASH,
};

export function defaultModelFor(task: AiTask): string {
    return DEFAULT_MODELS[task];
}

// empty today: basic and premium resolve alike until a task earns a heavier model on paid plans
const BASIC_OVERRIDES: Partial<Record<AiTask, string>> = {};

// debug-only: the route honours it behind an env flag, since model choice moves our cost, not the
// user's charge
export type ModelOverrides = Partial<Record<AiTask, string>>;

export function modelFor(
    task: AiTask,
    tier: ModelTier = "premium",
    overrides?: ModelOverrides,
): string {
    const picked = overrides?.[task];
    const id =
        picked && MODELS_BY_ID[picked]
            ? picked
            : ((tier === "basic" ? BASIC_OVERRIDES[task] : undefined) ?? DEFAULT_MODELS[task]);
    if (process.env.AI_MODEL_DEBUG === "1")
        out(`[ai:model] ${task} → ${id}${id === picked ? " (override)" : ""}`);
    return id;
}

// only ids we actually serve, so a bad header can't route a call to nothing
export function parseOverrides(raw: string | undefined | null): ModelOverrides {
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        const out: ModelOverrides = {};
        for (const [task, id] of Object.entries(parsed as Record<string, unknown>)) {
            if (!AI_TASKS.includes(task as AiTask)) continue;
            if (typeof id === "string" && MODELS_BY_ID[id]) out[task as AiTask] = id;
        }
        return out;
    } catch {
        return {};
    }
}

// Sampling knobs are a 400 on current Claude models — omit rather than pass a default.
export const samplingFor = (id: string, temperature: number): { temperature?: number } =>
    getModel(id)?.sampling === false ? {} : { temperature };

// empty unless something was overridden, so an odd turn reads as the model choice, not a regression
export function modelNote(overrides: ModelOverrides | undefined, tasks: readonly AiTask[]): string {
    if (!overrides) return "";
    const parts = tasks
        .filter((t) => overrides[t])
        .map((t) => `${t} → ${getModel(overrides[t]!)?.label ?? overrides[t]!}`);
    return parts.join(" · ");
}
