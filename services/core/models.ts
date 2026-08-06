import type { ModelTier } from "@model/billing";
import type { AiTask } from "@model/credits";
import { AI_TASKS } from "@model/credits";
import { out } from "../utils/env";

export type Provider = "anthropic" | "openai" | "google" | "xai";

export const PROVIDER_LABEL: Record<Provider, string> = {
    google: "Google",
    anthropic: "Anthropic",
    openai: "OpenAI",
    xai: "xAI",
};

// Google leads: every task defaults there, so the list opens on what is already selected.
export const PROVIDER_ORDER: readonly Provider[] = ["google", "anthropic", "openai", "xai"];

export type { AiTask } from "@model/credits";
export { AI_TASKS } from "@model/credits";

export interface ModelInfo {
    id: string;
    provider: Provider;
    model: string; // the provider's own model id
    label: string;
    contextWindow: number;
    json: boolean; // reliable structured / JSON output (generateObject)
    vision: boolean;
    usd: [inputPer1M: number, outputPer1M: number]; // see PRICED_ON
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
        usd: [10, 50],
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
        usd: [5, 25],
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
        usd: [5, 25],
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
        usd: [3, 15],
    },
    {
        id: "anthropic:claude-haiku-4-5",
        provider: "anthropic",
        model: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        contextWindow: 200_000,
        json: true,
        vision: true,
        usd: [1, 5],
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
        usd: [5, 30],
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
        usd: [2.5, 15],
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
        usd: [0.75, 4.5],
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
        usd: [0.2, 1.25],
    },
    {
        id: "google:gemini-2.5-pro",
        provider: "google",
        model: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        usd: [1.25, 10],
    },
    {
        id: "google:gemini-2.5-flash",
        provider: "google",
        model: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        usd: [0.3, 2.5],
    },
    {
        id: "google:gemini-3.5-flash",
        provider: "google",
        model: "gemini-3.5-flash",
        label: "Gemini 3.5 Flash",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        usd: [1.5, 9],
    },
    {
        id: "google:gemini-3.1-flash-lite-preview",
        provider: "google",
        model: "gemini-3.1-flash-lite-preview",
        label: "Gemini 3.1 Flash Lite (preview)",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        usd: [0.25, 1.5],
    },
    {
        id: "google:gemini-3.1-pro-preview",
        provider: "google",
        model: "gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro (preview)",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        usd: [2, 12],
    },
    {
        id: "xai:grok-4.3",
        provider: "xai",
        model: "grok-4.3",
        label: "Grok 4.3",
        contextWindow: 256_000,
        json: true,
        vision: true,
        usd: [1.25, 2.5],
    },
    {
        id: "xai:grok-4.20-reasoning",
        provider: "xai",
        model: "grok-4.20-reasoning",
        label: "Grok 4.20 (reasoning)",
        contextWindow: 256_000,
        json: true,
        vision: true,
        usd: [1.25, 2.5],
    },
    {
        id: "xai:grok-4.20-non-reasoning",
        provider: "xai",
        model: "grok-4.20-non-reasoning",
        label: "Grok 4.20 (fast)",
        contextWindow: 256_000,
        json: true,
        vision: true,
        usd: [1.25, 2.5],
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
    // only the overridden calls: the defaults are known, and a line per call would drown the log
    if (id === picked) out(`[ai:model] ${task} → ${id} (override)`);
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

// The token mix our calls actually run at, measured on the outline step: 1,861 in / 715 out.
const INPUT_SHARE = 0.7;

const blended = (m: ModelInfo): number => m.usd[0] * INPUT_SHARE + m.usd[1] * (1 - INPUT_SHARE);

// Everything is priced against the model every task defaults to, so an untouched run bills exactly
// what it billed before this existed.
const BASELINE = blended(MODELS_BY_ID[DEFAULT_MODELS.outline]!);

/**
 * What a call on this model costs us relative to the default, as a credit multiplier.
 * Price only: a heavier model also tends to write more (Opus 5 emitted 1.7x the tokens of Flash on
 * the same outline), so real spend runs somewhat above this. Unknown ids price at the baseline.
 */
export function costMultiplier(id: string): number {
    const m = MODELS_BY_ID[id];
    if (!m) return 1;
    return Math.round((blended(m) / BASELINE) * 100) / 100;
}

export const COST_MULTIPLIERS: Record<string, number> = Object.fromEntries(
    MODELS.map((m) => [m.id, costMultiplier(m.id)]),
);

// The client may pin any step to a specific model. Only ids the registry serves survive parsing, so
// a stale or hand-edited header degrades to the default rather than routing a call to nothing.
export const MODEL_HEADER = "x-galleo-models";

export interface ModelCatalogue {
    tasks: readonly AiTask[];
    models: { id: string; label: string; provider: string }[];
    defaults: Record<string, string>;
    rates: Record<string, number>;
}

// Each task's default is resolved for the caller's tier here, so the client never re-derives what
// the server would have picked.
export function modelCatalogue(tier: ModelTier): ModelCatalogue {
    return {
        tasks: AI_TASKS,
        models: [...MODELS]
            .sort((a, b) => PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider))
            .map((m) => ({ id: m.id, label: m.label, provider: PROVIDER_LABEL[m.provider] })),
        defaults: Object.fromEntries(AI_TASKS.map((t) => [t, modelFor(t, tier)])),
        rates: COST_MULTIPLIERS,
    };
}
