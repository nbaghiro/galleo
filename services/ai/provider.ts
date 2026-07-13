import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";
import type { Provider } from "./models";
import { getModel } from "./models";

// The provider abstraction — the one place that turns a `provider:model` id into a Vercel AI SDK
// `LanguageModel`, using the API keys already in the environment (copied from flowmaestro; same var names).
// Everything above this (prompts, runtimes, routes) is provider-agnostic: it asks for a task's model and
// calls `generateText`/`streamText`/`generateObject` against whatever this hands back.

// Env var per provider — the standard names, shared with flowmaestro's backend/.env.
const ENV_KEY: Record<Provider, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_API_KEY",
    xai: "XAI_API_KEY",
};

function keyFor(provider: Provider): string | undefined {
    return process.env[ENV_KEY[provider]] || undefined;
}

function requireKey(provider: Provider): string {
    const k = keyFor(provider);
    if (!k) throw new Error(`${ENV_KEY[provider]} is not set`);
    return k;
}

// True when the provider has a key configured — lets a route degrade gracefully (like the media/billing
// routes do) instead of throwing at import time.
export function providerReady(provider: Provider): boolean {
    return !!keyFor(provider);
}

// Any text model available at all → the AI features can light up.
export function aiReady(): boolean {
    return (Object.keys(ENV_KEY) as Provider[]).some(providerReady);
}

// One SDK client per provider, built lazily on first use.
let anthropic: ReturnType<typeof createAnthropic> | undefined;
let openai: ReturnType<typeof createOpenAI> | undefined;
let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;
let xai: ReturnType<typeof createXai> | undefined;

// Resolve a registry id (e.g. "anthropic:claude-sonnet-5") to a ready-to-use LanguageModel. Throws on an
// unknown id or a missing key — callers gate on `aiReady()` / `providerReady()` first.
export function resolveModel(id: string): LanguageModel {
    const info = getModel(id);
    if (!info) throw new Error(`unknown model id: ${id}`);
    switch (info.provider) {
        case "anthropic":
            anthropic ??= createAnthropic({ apiKey: requireKey("anthropic") });
            return anthropic(info.model);
        case "openai":
            openai ??= createOpenAI({ apiKey: requireKey("openai") });
            return openai(info.model);
        case "google":
            google ??= createGoogleGenerativeAI({ apiKey: requireKey("google") });
            return google(info.model);
        case "xai":
            xai ??= createXai({ apiKey: requireKey("xai") });
            return xai(info.model);
    }
}

// Generation provider options for a given model. Disabling thinking (Gemini `thinkingBudget: 0`) keeps
// generation snappy with little quality loss — but ONLY the Flash tier accepts a 0 budget; the Pro models
// reject it outright ("Budget 0 is invalid. This model only works in thinking mode."), so they run with
// their default thinking. Non-Google providers ignore Google-specific options, so they get no override.
// Every generation call routes through this instead of a hardcoded constant, so any model can be selected.
export function thinklessOpts(id: string) {
    const info = getModel(id);
    if (info?.provider === "google" && !/pro/i.test(info.model)) {
        return { google: { thinkingConfig: { thinkingBudget: 0 } } };
    }
    return undefined; // no override — other providers ignore Google opts; Pro models require thinking
}
