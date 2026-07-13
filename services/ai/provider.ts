import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";
import type { Provider } from "./models";
import { getModel } from "./models";

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

export function providerReady(provider: Provider): boolean {
    return !!keyFor(provider);
}

export function aiReady(): boolean {
    return (Object.keys(ENV_KEY) as Provider[]).some(providerReady);
}

let anthropic: ReturnType<typeof createAnthropic> | undefined;
let openai: ReturnType<typeof createOpenAI> | undefined;
let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;
let xai: ReturnType<typeof createXai> | undefined;

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

// Pro models reject thinkingBudget:0 ("only works in thinking mode"), so only Flash gets the 0-budget override
export function thinklessOpts(id: string) {
    const info = getModel(id);
    if (info?.provider === "google" && !/pro/i.test(info.model)) {
        return { google: { thinkingConfig: { thinkingBudget: 0 } } };
    }
    return undefined;
}
