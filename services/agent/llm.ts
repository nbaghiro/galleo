import { createAnthropic } from "@ai-sdk/anthropic";
import { createCohere } from "@ai-sdk/cohere";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { generateObject, generateText, streamText, type LanguageModel } from "ai";
import type { z } from "zod";
import { MODELS, resolveModel, type Provider, type Quality, type Role } from "./models";

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
