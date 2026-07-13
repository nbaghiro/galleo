// The model registry — one place that names every LLM the AI module can reach, across providers, plus the
// default model for each task. Ids are `provider:model`. Keep this as the single source of truth for model
// choice (mirrors flowmaestro's `llm-models.ts`); routes and the prompt system reference tasks, not raw
// model ids, so re-tuning which model does what is a one-line change here.

export type Provider = "anthropic" | "openai" | "google" | "xai";

// Every capability the module offers. `generate` is the heavy one (a whole artifact); `rewrite`/`translate`
// are high-volume and latency-sensitive, so they default to a fast model.
export type AiTask =
    | "generate"
    | "outline"
    | "section"
    | "edit"
    | "rewrite"
    | "translate"
    | "chat"
    | "theme";

export interface ModelInfo {
    id: string; // "anthropic:claude-sonnet-5"
    provider: Provider;
    model: string; // the provider's own model id
    label: string;
    contextWindow: number;
    json: boolean; // reliable structured / JSON output (generateObject)
    vision: boolean; // accepts image input
}

// The catalog. Google (Gemini) leads: fast, strong, huge context, and it also powers images (and, ahead,
// video) — so a single GOOGLE_API_KEY covers text + media. The other providers stay wired so a workspace
// can route to whatever key it has. Extend freely.
//
// Media models (not LanguageModels — served by services/media/generate.ts via the GOOGLE key): images use
// `gemini-2.5-flash-image` (override GEMINI_IMAGE_MODEL); video (Veo) is the planned next media capability.
export const MODELS: readonly ModelInfo[] = [
    // Anthropic — model ids per the current Claude family.
    {
        id: "anthropic:claude-opus-4-8",
        provider: "anthropic",
        model: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        contextWindow: 200_000,
        json: true,
        vision: true,
    },
    {
        id: "anthropic:claude-sonnet-5",
        provider: "anthropic",
        model: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        contextWindow: 200_000,
        json: true,
        vision: true,
    },
    {
        id: "anthropic:claude-haiku-4-5",
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5",
        contextWindow: 200_000,
        json: true,
        vision: true,
    },
    // OpenAI
    {
        id: "openai:gpt-5",
        provider: "openai",
        model: "gpt-5",
        label: "GPT-5",
        contextWindow: 400_000,
        json: true,
        vision: true,
    },
    {
        id: "openai:gpt-5-mini",
        provider: "openai",
        model: "gpt-5-mini",
        label: "GPT-5 mini",
        contextWindow: 400_000,
        json: true,
        vision: true,
    },
    // Google
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
        id: "google:gemini-3.1-pro-preview",
        provider: "google",
        model: "gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro (preview)",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
    },
    // xAI
    {
        id: "xai:grok-4",
        provider: "xai",
        model: "grok-4",
        label: "Grok 4",
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

// The default model per task. Google Gemini across the board: Flash for generation (outline + the
// high-volume, latency-sensitive per-section writing — a deck is ~12 sequential calls, so Pro's reasoning
// latency stacks up badly), Pro reserved for whole-artifact edit. Tunable here; a request may override.
export const DEFAULT_MODELS: Record<AiTask, string> = {
    generate: "google:gemini-2.5-flash",
    outline: "google:gemini-2.5-flash",
    section: "google:gemini-2.5-flash",
    edit: "google:gemini-2.5-pro",
    rewrite: "google:gemini-2.5-flash",
    translate: "google:gemini-2.5-flash",
    // The chat AGENT picks + chains tools and reads nuance. An eval harness A/B (services/ai/eval) measured
    // 3.5-flash at 100% tool-routing vs 2.5-pro's inconsistent 80% (it intermittently skipped the tool call
    // on edit/management asks), at ~1.5× the speed and finer streaming — so the agent runs on 3.5-flash.
    // Re-run `pnpm ai:eval` before changing this. (2.5-pro is one line away as a fallback.)
    chat: "google:gemini-3.5-flash",
    // A theme is a tiny structured output — Flash lands it in ~7s vs Pro's ~12s (up to 17s) at comparable
    // quality, since the deterministic contrast/OKLCH finalize pass guarantees safety regardless of model.
    theme: "google:gemini-2.5-flash",
};

export function defaultModelFor(task: AiTask): string {
    return DEFAULT_MODELS[task];
}
