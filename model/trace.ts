import type { ArtifactContent } from "./artifact";
import type { ToolId, ToolSurface } from "./tools";

// The record of one root tool call: what ran, what it called, what it cost, and what it made.
// Kept for every call at the `metrics` level and read by the eval playground, the analytics that
// key on a call, and any analyzer added later. A trace is content-free at `metrics`; the prompt
// bodies, the input and the artifact appear only at `full`.

export interface PromptPart {
    name: string;
    text: string;
}

/**
 * One model call, as the runtime recorded it. The meter reads the token fields to bill, and the
 * playground reads the rest to explain. The bodies are clipped at capture and stripped at
 * `metrics`.
 */
export interface ModelSpan {
    modelId: string;
    input: number; // tokens, cached ones included
    output: number;
    /** The share of `input` the provider served from its prompt cache, priced at the cached rate. */
    cached?: number;
    step: string; // "outline" | "plan-section" | "section:<beatId>" | "" when unlabelled
    ms: number;
    system?: string;
    prompt?: string;
    response?: string;
    temperature?: number;
    finishReason?: string;
    /** The named fragments the system prompt was assembled from, when the builder labelled them. */
    parts?: PromptPart[];
}

export type TraceLevel = "metrics" | "full";
export type TraceStatus = "ok" | "error" | "refused" | "aborted";

export interface PatchCounts {
    artifact: number;
    generation: number;
    workspace: boolean;
}

interface SpanBase {
    id: string;
    parent: string | null; // the tool span this ran under; null for the root
    at: number; // ms after the trace opened
}

export interface ToolSpan extends SpanBase {
    kind: "tool";
    tool: ToolId;
    surface: ToolSurface;
    ms: number;
    status: TraceStatus;
    error?: string;
    patches?: PatchCounts; // counts, never the ops
    flags?: string[]; // what the body noted about its own run ("unchecked": a section kept past its checks)
}

export interface ModelCall extends SpanBase, ModelSpan {
    kind: "model";
}

export type TraceSpan = ToolSpan | ModelCall;

export interface Trace {
    id: string;
    workspaceId: string | null; // null for a public tool
    userId: string | null;
    surface: ToolSurface;
    tool: ToolId;
    generationId: string | null;
    artifactId: string | null;
    level: TraceLevel;
    status: TraceStatus;
    error: string | null;
    models: Record<string, string>; // the model in effect per task when the call ran
    tokensIn: number;
    tokensOut: number;
    credits: number; // what the ledger settled, not the estimate
    ms: number;
    at: string; // ISO
    spans: TraceSpan[]; // flat, parent-linked; spans[0] is the root tool span
    input: unknown | null; // full only
    content: ArtifactContent | null; // full only: the artifact after the call
}

/** A list row: everything but the spans and the bodies. */
export type TraceSummary = Omit<Trace, "spans" | "input" | "content"> & {
    spanCount: number;
    tools: ToolId[]; // every tool span, root first
};

export const modelCalls = (spans: readonly TraceSpan[]): ModelCall[] =>
    spans.filter((s): s is ModelCall => s.kind === "model");

export const toolSpans = (spans: readonly TraceSpan[]): ToolSpan[] =>
    spans.filter((s): s is ToolSpan => s.kind === "tool");

export const stepsOf = (spans: readonly ModelSpan[]): string[] => [
    ...new Set(spans.map((s) => s.step).filter(Boolean)),
];

export const spansForStep = (spans: readonly ModelSpan[], step: string): ModelSpan[] =>
    spans.filter((s) => s.step === step);

export const tokensOf = (spans: readonly ModelSpan[]): { input: number; output: number } =>
    spans.reduce((t, s) => ({ input: t.input + s.input, output: t.output + s.output }), {
        input: 0,
        output: 0,
    });

/** A span reduced to what `metrics` keeps: the measurements, none of the words. */
export function stripBodies(span: ModelCall): ModelCall {
    const { system: _s, prompt: _p, response: _r, parts: _q, ...kept } = span;
    return kept;
}
