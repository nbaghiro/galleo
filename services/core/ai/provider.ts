import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import type { EmbeddingModel, LanguageModel } from "ai";
import type { PromptPart } from "@model/ai";
import type { LanguageModelMiddleware } from "ai";
import { wrapLanguageModel } from "ai";
import { partsOf, record, recordTokens, tracing } from "./meter";

// what `providerOptions` accepts: one JSON bag per provider name (the SDK's SharedV4ProviderOptions)
type Json = string | number | boolean | null | { [k: string]: Json } | Json[];
type ProviderOpts = Record<string, { [k: string]: Json }>;
import type { Provider } from "@services/core/models";
import { getModel, samplingFor } from "@services/core/models";

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

// the one embedding provider; contexts and conversation memory need it, everything else degrades
export function embeddingReady(): boolean {
    return providerReady("google");
}

export function googleEmbedding(modelId: string): EmbeddingModel {
    google ??= createGoogleGenerativeAI({ apiKey: requireKey("google") });
    return google.embedding(modelId);
}

let anthropic: ReturnType<typeof createAnthropic> | undefined;
let openai: ReturnType<typeof createOpenAI> | undefined;
let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;
let xai: ReturnType<typeof createXai> | undefined;

type StreamPart =
    Awaited<
        ReturnType<NonNullable<LanguageModelMiddleware["wrapStream"]>>
    >["stream"] extends ReadableStream<infer P>
        ? P
        : never;

// prompt bodies are unbounded; a span is for reading, not for archiving the whole context
const CLIP = 20_000;
const clip = (s: string): string => (s.length > CLIP ? `${s.slice(0, CLIP)}\n… [clipped]` : s);

// Pull the system and user text back out of the params the SDK is about to send, so a trace shows
// what actually went over the wire rather than what a prompt builder would produce if re-run.
type CallParams = Parameters<NonNullable<LanguageModelMiddleware["wrapGenerate"]>>[0]["params"];

function promptOf(params: CallParams): { system?: string; prompt?: string } {
    const parts = params.prompt;
    if (!Array.isArray(parts)) return {};
    const textOf = (m: (typeof parts)[number]): string =>
        typeof m.content === "string"
            ? m.content
            : m.content
                  .map((c: { type: string; text?: string }) =>
                      typeof c.text === "string" ? c.text : `[${c.type}]`,
                  )
                  .join("\n");
    const system = parts
        .filter((m) => m.role === "system")
        .map(textOf)
        .join("\n\n");
    const prompt = parts
        .filter((m) => m.role !== "system")
        .map((m) => `${m.role}: ${textOf(m)}`)
        .join("\n\n");
    // unclipped: the parts lookup keys on the exact text the builder produced
    return { system: system || undefined, prompt: prompt || undefined };
}

/** The trace fields of a span: prompts clipped for storage, parts resolved against the full text. */
function traceFields(params: CallParams): {
    system?: string;
    prompt?: string;
    parts?: PromptPart[];
} {
    const { system, prompt } = promptOf(params);
    return {
        system: system ? clip(system) : undefined,
        prompt: prompt ? clip(prompt) : undefined,
        parts: partsOf(system),
    };
}

// The provider reports a structured finish reason, so String() on it yields "[object Object]".
function finishOf(reason: unknown): string | undefined {
    if (typeof reason === "string") return reason;
    if (reason && typeof reason === "object" && "type" in reason) {
        const t = (reason as { type: unknown }).type;
        if (typeof t === "string") return t;
    }
    return undefined;
}

// The one place every call passes through, so metering here cannot be forgotten at a call site.
function metering(id: string): LanguageModelMiddleware {
    return {
        wrapGenerate: async ({ doGenerate, params }) => {
            const t0 = Date.now();
            const r = await doGenerate();
            const input = r.usage?.inputTokens?.total ?? 0;
            const output = r.usage?.outputTokens?.total ?? 0;
            if (!tracing()) {
                recordTokens(id, input, output);
                return r;
            }
            const text = r.content
                ?.map((c) => ("text" in c && typeof c.text === "string" ? c.text : ""))
                .join("");
            record({
                modelId: id,
                input,
                output,
                step: "",
                ms: Date.now() - t0,
                ...traceFields(params),
                response: text ? clip(text) : undefined,
                temperature: params.temperature,
                finishReason: finishOf(r.finishReason),
            });
            return r;
        },
        // a stream only knows its usage at the end, so tap the parts on the way past
        wrapStream: async ({ doStream, params }) => {
            const t0 = Date.now();
            const r = await doStream();
            const traced = tracing();
            let text = "";
            return {
                ...r,
                stream: r.stream.pipeThrough(
                    new TransformStream<StreamPart, StreamPart>({
                        transform(part, controller) {
                            if (traced && part.type === "text-delta" && "delta" in part)
                                text += String(part.delta);
                            if (part.type === "finish") {
                                const input = part.usage?.inputTokens?.total ?? 0;
                                const output = part.usage?.outputTokens?.total ?? 0;
                                if (traced)
                                    record({
                                        modelId: id,
                                        input,
                                        output,
                                        step: "",
                                        ms: Date.now() - t0,
                                        ...traceFields(params),
                                        response: text ? clip(text) : undefined,
                                        temperature: params.temperature,
                                        finishReason: finishOf(part.finishReason),
                                    });
                                else recordTokens(id, input, output);
                            }
                            controller.enqueue(part);
                        },
                    }),
                ),
            };
        },
    };
}

// private on purpose: reach a model through modelCall, which carries the provider
// options a bare model would silently drop
function resolveModel(id: string): LanguageModel {
    return wrapLanguageModel({ model: rawModel(id), middleware: metering(id) });
}

function rawModel(id: string) {
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

// Per-provider knobs every call needs. Keyed by provider name, so a key another provider does not
// know is simply ignored by it.
function providerOpts(id: string): ProviderOpts | undefined {
    const info = getModel(id);
    // Pro models reject thinkingBudget:0 ("only works in thinking mode"), so only Flash gets it
    if (info?.provider === "google" && !/pro/i.test(info.model)) {
        return { google: { thinkingConfig: { thinkingBudget: 0 } } };
    }
    // Anthropic's native constrained decoding compiles a grammar per schema and gives up on ours
    // with "Grammar compilation timed out"; the tool-shaped path has no such limit.
    if (info?.provider === "anthropic") {
        return { anthropic: { structuredOutputMode: "jsonTool" } };
    }
    // OpenAI's strict mode demands every property in `required`, so any optional field is rejected
    // outright ("'required' is required to be supplied and to be an array"). Our schemas are full of
    // genuinely optional fields, so strict is the wrong contract for them.
    if (info?.provider === "openai") {
        return { openai: { strictJsonSchema: false } };
    }
    return undefined;
}

/**
 * Everything a call needs to run correctly on `id`: the metered model, the provider quirks it has
 * to be told about, and a temperature only where the model accepts one. Spread it into
 * generateObject / generateText / an agent so a call site cannot silently omit one of the three —
 * missing providerOptions is not a slow path, it is a hard failure on Anthropic and OpenAI.
 */
export function modelCall(id: string, temperature?: number): ModelCall {
    return {
        model: resolveModel(id),
        providerOptions: providerOpts(id),
        ...(temperature === undefined ? {} : samplingFor(id, temperature)),
    };
}

interface ModelCall {
    model: LanguageModel;
    providerOptions?: ProviderOpts;
    temperature?: number;
}
