export type Provider = "anthropic" | "openai" | "google" | "xai";

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
    id: string;
    provider: Provider;
    model: string; // the provider's own model id
    label: string;
    contextWindow: number;
    json: boolean; // reliable structured / JSON output (generateObject)
    vision: boolean;
}

export const MODELS: readonly ModelInfo[] = [
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

export const DEFAULT_MODELS: Record<AiTask, string> = {
    generate: "google:gemini-2.5-flash",
    outline: "google:gemini-2.5-flash",
    section: "google:gemini-2.5-flash",
    edit: "google:gemini-2.5-pro",
    rewrite: "google:gemini-2.5-flash",
    translate: "google:gemini-2.5-flash",
    // eval (services/ai/eval) measured 3.5-flash 100% tool-routing vs 2.5-pro's 80%. Re-run `pnpm ai:eval` before changing.
    chat: "google:gemini-3.5-flash",
    // tiny structured output — Flash ~7s vs Pro ~12s at comparable quality (finalize pass guarantees safety)
    theme: "google:gemini-2.5-flash",
};

export function defaultModelFor(task: AiTask): string {
    return DEFAULT_MODELS[task];
}
