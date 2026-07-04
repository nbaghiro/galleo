// The LLM provider layer: the model registry (providers · roles · quality tiers · resolveModel) + the Vercel AI SDK calls that use it.

import { createAnthropic } from "@ai-sdk/anthropic";
import { createCohere } from "@ai-sdk/cohere";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { generateObject, generateText, streamText, type LanguageModel } from "ai";
import type { z } from "zod";

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

// The multi-provider LLM layer over the Vercel AI SDK: one `complete / structured / stream` API across
// Anthropic, OpenAI, Google, xAI, and Cohere. Stages call it with a role (or an explicit model); the
// registry resolves the key → a real provider model. Each provider is created with the key under OUR env
// name (some SDK defaults differ — Google's is GOOGLE_GENERATIVE_AI_API_KEY), so all read from `.env`.

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
const xai = createXai({ apiKey: process.env.XAI_API_KEY });
const cohere = createCohere({ apiKey: process.env.COHERE_API_KEY });

function model(key: string): LanguageModel {
    const def = MODELS[key];
    if (!def) throw new Error(`unknown model: ${key}`);
    const byProvider: Record<Provider, LanguageModel> = {
        anthropic: anthropic(def.id),
        openai: openai(def.id),
        google: google(def.id),
        xai: xai(def.id),
        cohere: cohere(def.id),
    };
    return byProvider[def.provider];
}

export interface CallOpts {
    model?: string; // explicit registry key — wins over role
    role?: Role;
    quality?: Quality;
    system?: string;
    user: string;
    maxTokens?: number;
}

const pick = (o: CallOpts): string =>
    o.model ?? resolveModel(o.role ?? "chat", { quality: o.quality });

// Plain text completion.
export async function complete(opts: CallOpts): Promise<string> {
    const { text } = await generateText({
        model: model(pick(opts)),
        system: opts.system,
        prompt: opts.user,
        maxOutputTokens: opts.maxTokens ?? 4096,
    });
    return text;
}

// Structured output constrained to a zod schema — the staged IR comes back already shaped + validated.
export async function structured<T>(opts: CallOpts & { schema: z.ZodType<T> }): Promise<T> {
    const { object } = await generateObject({
        model: model(pick(opts)),
        schema: opts.schema,
        system: opts.system,
        prompt: opts.user,
        maxOutputTokens: opts.maxTokens ?? 4096,
    });
    return object;
}

// Streaming text — for narrated writing (the pipeline forwards deltas as `narration` events).
export function stream(opts: CallOpts): ReturnType<typeof streamText> {
    return streamText({
        model: model(pick(opts)),
        system: opts.system,
        prompt: opts.user,
        maxOutputTokens: opts.maxTokens ?? 4096,
    });
}
