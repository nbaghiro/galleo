import type { ModelTier } from "@model/billing";
import type { AiTask, CostUnit, UnitPrices } from "@model/credits";
import { AI_TASKS, unitPricesFrom } from "@model/credits";
import { out } from "@services/utils/env";
import { NARRATION_MODEL } from "./ai/speech";
import { MUSIC_MODEL } from "./ai/music";

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
    /** ISO date the price was last checked against the provider, or "unverified". check:prices
     * fails when this goes stale, because a wrong price bills every run through it. */
    pricedOn: string;
    /** ISO date `pnpm ai:probe` last got a real answer on this id, or "unprobed". check:models
     * proves the SDK declares an id; only a call proves the provider still serves it to our key
     * and accepts the options we send. A model is not finished until this is set. */
    probedOn: string;
    // Input per 1M when the provider serves the tokens from its prompt cache, roughly a tenth of
    // the standard rate. Absent = the provider publishes none, so cached tokens price as standard.
    cachedUsd?: number;
    // the plan tier that unlocks this model as an override; the default per task ignores it
    minTier?: ModelTier;
    // Claude 4.7+ rejects temperature/top_p/top_k with a 400; see samplingFor()
    sampling?: false;
    // Rejects thinkingConfig.thinkingBudget, so the call must not try to switch thinking off: Google
    // Pro models answer "only works in thinking mode" and the newer Flash models 400 outright.
    // Declared rather than inferred from the name, which is how gemini-3.6-flash shipped broken.
    thinkingBudget?: false;
}

export const MODELS: readonly ModelInfo[] = [
    {
        id: "anthropic:claude-fable-5",
        minTier: "premium",
        provider: "anthropic",
        model: "claude-fable-5",
        label: "Claude Fable 5",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        sampling: false,
        usd: [10, 50],
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
    },
    {
        id: "anthropic:claude-opus-5",
        minTier: "premium",
        provider: "anthropic",
        model: "claude-opus-5",
        label: "Claude Opus 5",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        sampling: false,
        usd: [5, 25],
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
    },
    {
        id: "anthropic:claude-opus-4-8",
        minTier: "premium",
        provider: "anthropic",
        model: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        sampling: false,
        usd: [5, 25],
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
    },
    {
        id: "anthropic:claude-sonnet-5",
        minTier: "premium",
        provider: "anthropic",
        model: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        sampling: false,
        usd: [2, 10],
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
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
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
    },
    {
        id: "openai:gpt-5.5",
        minTier: "premium",
        provider: "openai",
        model: "gpt-5.5",
        label: "GPT-5.5",
        contextWindow: 400_000,
        json: true,
        vision: true,
        sampling: false,
        usd: [5, 30],
        pricedOn: "unverified",
        probedOn: "2026-08-30",
    },
    {
        id: "openai:gpt-5.4",
        minTier: "premium",
        provider: "openai",
        model: "gpt-5.4",
        label: "GPT-5.4",
        contextWindow: 400_000,
        json: true,
        vision: true,
        sampling: false,
        usd: [2.5, 15],
        pricedOn: "unverified",
        probedOn: "2026-08-30",
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
        pricedOn: "unverified",
        probedOn: "2026-08-30",
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
        pricedOn: "unverified",
        probedOn: "2026-08-30",
    },
    {
        id: "google:gemini-2.5-pro",
        minTier: "premium",
        provider: "google",
        model: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        usd: [1.25, 10],
        thinkingBudget: false,
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
        cachedUsd: 0.125,
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
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
        cachedUsd: 0.03,
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
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
        cachedUsd: 0.15,
    },
    {
        id: "google:gemini-3.6-flash",
        provider: "google",
        model: "gemini-3.6-flash",
        label: "Gemini 3.6 Flash",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        // promotional through 2026-12-31; reverts to [1.5, 7.5] after
        usd: [0.75, 3.75],
        thinkingBudget: false,
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
        cachedUsd: 0.075,
    },
    {
        id: "google:gemini-3.5-flash-lite",
        provider: "google",
        model: "gemini-3.5-flash-lite",
        label: "Gemini 3.5 Flash Lite",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        usd: [0.3, 2.5],
        thinkingBudget: false,
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
        cachedUsd: 0.03,
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
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
        cachedUsd: 0.025,
    },
    {
        id: "google:gemini-3.1-pro-preview",
        minTier: "premium",
        provider: "google",
        model: "gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro (preview)",
        contextWindow: 1_000_000,
        json: true,
        vision: true,
        usd: [2, 12],
        thinkingBudget: false,
        pricedOn: "2026-08-30",
        probedOn: "2026-08-30",
        cachedUsd: 0.2,
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
        pricedOn: "unverified",
        probedOn: "2026-08-30",
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
        pricedOn: "unverified",
        probedOn: "2026-08-30",
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
        pricedOn: "unverified",
        probedOn: "2026-08-30",
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
    extract: FLASH,
};

export function defaultModelFor(task: AiTask): string {
    return DEFAULT_MODELS[task];
}

// empty today: basic and premium resolve alike until a task earns a heavier model on paid plans
const BASIC_OVERRIDES: Partial<Record<AiTask, string>> = {};

// debug-only: the route honours it behind an env flag, since model choice moves our cost, not the
// user's charge
export type ModelOverrides = Partial<Record<AiTask, string>>;

const TIER_RANK: Record<ModelTier, number> = { basic: 0, advanced: 1, premium: 2 };

// a model with no minTier is open to every plan; the task defaults bypass this on purpose
export function tierAllows(tier: ModelTier, id: string): boolean {
    const min = MODELS_BY_ID[id]?.minTier;
    return !min || TIER_RANK[tier] >= TIER_RANK[min];
}

export function modelFor(
    task: AiTask,
    tier: ModelTier = "premium",
    overrides?: ModelOverrides,
): string {
    const picked = overrides?.[task];
    const id =
        picked && MODELS_BY_ID[picked] && tierAllows(tier, picked)
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

/** The text units, which price per token rather than per call. */
type TextUnit = Exclude<CostUnit, MediaUnit>;

/**
 * What one unit of each kind of text work sends and receives. `plan` and `section` are measured:
 * 283 recorded calls in eval_runs average 2,659 in / 1,673 out for the outline step and
 * 8,171 in / 656 out for a section write. The rest are ESTIMATES and have never been measured; they
 * are deliberately a little generous so the pre-flight hold does not come up short, and each should
 * be replaced with a measurement the same way the first two were.
 */
const UNIT_TOKENS: Record<TextUnit, { in: number; out: number }> = {
    plan: { in: 2659, out: 1673 }, // measured
    section: { in: 8171, out: 656 }, // measured
    text: { in: 2500, out: 400 }, // estimate
    theme: { in: 3500, out: 1500 }, // estimate
    reply: { in: 8000, out: 800 }, // estimate
};

const isTextUnit = (unit: CostUnit): unit is TextUnit => unit in UNIT_TOKENS;

/** What one unit of text work costs on a given model, in dollars. */
export function textUnitPrice(modelId: string, unit: CostUnit): number | undefined {
    const m = MODELS_BY_ID[modelId];
    if (!m || !isTextUnit(unit)) return undefined;
    const t = UNIT_TOKENS[unit];
    return (t.in / 1e6) * m.usd[0] + (t.out / 1e6) * m.usd[1];
}

/** Every text unit's price on one model, for a client that has no registry of its own. */
const textPricesOf = (modelId: string): UnitPrices =>
    Object.fromEntries(
        (Object.keys(UNIT_TOKENS) as TextUnit[]).map((u) => [u, textUnitPrice(modelId, u)]),
    );

// Media models. Kept in their own registry rather than in MODELS because they are not language
// models: they have no token prices, and check:models validates MODELS against the ids the
// @ai-sdk provider packages declare.

/** The cost units a media model serves; every other unit is token work priced per model above. */
export type MediaUnit = Extract<CostUnit, "image" | "video" | "speech" | "music">;

export interface MediaModelInfo {
    id: string;
    label: string;
    unit: MediaUnit;
    /** ISO date the price was last checked against the provider; see ModelInfo.pricedOn. */
    pricedOn: string;
    /** Real provider price for one unit: an image, an 8s clip, 1k characters, a minute. Quoted at
     * the size and settings we actually request, so changing a request size means re-checking it. */
    usdPerUnit: number;
}

const BASE_IMAGE_MODEL = "gemini-3.1-flash-image";
const BASE_VIDEO_MODEL = "veo-3.1-fast-generate-preview";

export const MEDIA_MODELS: readonly MediaModelInfo[] = [
    // $0.045 to $0.151 by output size; 0.071 is the ~1.5K we actually ask for
    {
        id: BASE_IMAGE_MODEL,
        label: "Gemini 3.1 Flash Image",
        unit: "image",
        usdPerUnit: 0.071,
        pricedOn: "2026-08-30",
    },
    {
        id: "gemini-3.1-flash-lite-image",
        label: "Gemini 3.1 Flash Lite Image",
        unit: "image",
        usdPerUnit: 0.0336,
        pricedOn: "2026-08-30",
    },
    {
        id: "gemini-3-pro-image",
        label: "Gemini 3 Pro Image",
        unit: "image",
        usdPerUnit: 0.134,
        pricedOn: "2026-08-30",
    },
    {
        id: "gemini-2.5-flash-image",
        label: "Gemini 2.5 Flash Image",
        unit: "image",
        usdPerUnit: 0.039,
        pricedOn: "2026-08-30",
    },
    // per 8s clip: Fast is $0.10 to $0.30 a second, so 1.42 is the midpoint of what we ask for
    {
        id: BASE_VIDEO_MODEL,
        label: "Veo 3.1 Fast",
        unit: "video",
        usdPerUnit: 1.42,
        pricedOn: "2026-08-30",
    },
    {
        id: "veo-3.1-generate-preview",
        label: "Veo 3.1",
        unit: "video",
        usdPerUnit: 4.0,
        pricedOn: "2026-08-30",
    },
    {
        id: "veo-3.1-lite-generate-preview",
        label: "Veo 3.1 Lite",
        unit: "video",
        usdPerUnit: 0.52,
        pricedOn: "2026-08-30",
    },
    {
        id: NARRATION_MODEL,
        label: "ElevenLabs Multilingual v2",
        unit: "speech",
        usdPerUnit: 0.1,
        pricedOn: "2026-08-30",
    },
    {
        id: MUSIC_MODEL,
        label: "ElevenLabs Music v1",
        unit: "music",
        usdPerUnit: 0.15,
        pricedOn: "2026-08-30",
    },
] as const;

const MEDIA_BY_ID: Record<string, MediaModelInfo> = Object.fromEntries(
    MEDIA_MODELS.map((m) => [m.id, m]),
);

// The image and video ids live here rather than beside the fetch calls in core/media.ts, so the
// model that runs and the price it bills at cannot drift apart.
export const imageModelId = (tier?: ModelTier): string =>
    tier === "basic" ? BASE_IMAGE_MODEL : process.env.GEMINI_IMAGE_MODEL || BASE_IMAGE_MODEL;

export const videoModelId = (): string => process.env.GEMINI_VIDEO_MODEL || BASE_VIDEO_MODEL;

export const MEDIA_UNITS: readonly MediaUnit[] = ["image", "video", "speech", "music"];

const isMediaUnit = (unit: CostUnit): unit is MediaUnit =>
    (MEDIA_UNITS as readonly CostUnit[]).includes(unit);

/** The media model actually in play for a unit, given the caller's image tier. */
export function mediaModelFor(unit: MediaUnit, tier?: ModelTier): string {
    if (unit === "image") return imageModelId(tier);
    if (unit === "video") return videoModelId();
    return unit === "speech" ? NARRATION_MODEL : MUSIC_MODEL;
}

/**
 * What one produced unit costs, from the media model that will actually serve it, so a picture made
 * on a pro model bills more than the same picture on a lite one. Undefined for a unit that is token
 * work rather than media, or for a model we have not priced.
 */
export function mediaUnitPrice(unit: CostUnit, tier?: ModelTier): number | undefined {
    if (!isMediaUnit(unit)) return undefined;
    return MEDIA_BY_ID[mediaModelFor(unit, tier)]?.usdPerUnit;
}

/** Every media unit's price for a tier, which does not vary with the text model a caller pinned. */
const mediaPricesFor = (tier?: ModelTier): UnitPrices =>
    Object.fromEntries(MEDIA_UNITS.map((u) => [u, mediaUnitPrice(u, tier)]));

/**
 * The dollar price of every unit for one caller: text units from the model their task resolves to,
 * media units from the model that serves them. The single input to every credit figure the product
 * quotes or charges.
 */
export function unitPricesFor(tier: ModelTier, overrides: ModelOverrides = {}): UnitPrices {
    return unitPricesFrom(
        (task) => modelFor(task, tier, overrides),
        textUnitPrice,
        (unit) => mediaUnitPrice(unit, tier),
    );
}

// The client may pin any step to a specific model. Only ids the registry serves survive parsing, so
// a stale or hand-edited header degrades to the default rather than routing a call to nothing.
export const MODEL_HEADER = "x-galleo-models";

export interface ModelCatalogue {
    tasks: readonly AiTask[];
    models: { id: string; label: string; provider: string; locked: boolean }[];
    defaults: Record<string, string>;
    // USD per text unit on each model, so a client pricing a pinned model needs no registry of its
    // own, and media prices, which do not vary with the text model a caller picks.
    unitPrices: Record<string, UnitPrices>;
    mediaPrices: UnitPrices;
}

// Each task's default is resolved for the caller's tier here, so the client never re-derives what
// the server would have picked.
export function modelCatalogue(tier: ModelTier): ModelCatalogue {
    return {
        tasks: AI_TASKS,
        models: [...MODELS]
            .sort((a, b) => PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider))
            .map((m) => ({
                id: m.id,
                label: m.label,
                provider: PROVIDER_LABEL[m.provider],
                locked: !tierAllows(tier, m.id), // the picker greys these instead of silently ignoring them
            })),
        defaults: Object.fromEntries(AI_TASKS.map((t) => [t, modelFor(t, tier)])),
        unitPrices: Object.fromEntries(MODELS.map((m) => [m.id, textPricesOf(m.id)])),
        mediaPrices: mediaPricesFor(tier),
    };
}
