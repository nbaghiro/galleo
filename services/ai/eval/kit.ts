import { writeFileSync } from "fs";
import { generateObject } from "ai";
import type { ZodType } from "zod";
import { resolveModel, thinklessOpts } from "../provider";

// Shared eval machinery — CLI parsing, concurrency, math, the LLM-judge call, and the markdown report writer.
// Both eval modes (agent routing + generation quality) build on this so neither re-implements the plumbing.

export const log = (s = ""): void => {
    process.stdout.write(`${s}\n`);
};

// --- CLI ---
export function arg(name: string, fallback: string): string {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
}
export const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);
export const list = (name: string, fallback: string): string[] =>
    arg(name, fallback)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
export const int = (name: string, fallback: number, min = 1): number =>
    Math.max(min, parseInt(arg(name, String(fallback)), 10));

export const shortModel = (id: string): string => id.split(":").pop() ?? id;

// --- math ---
export const avg = (a: number[]): number =>
    a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
export const pct = (p: number, t: number): string => `${t ? Math.round((p / t) * 100) : 0}%`;

// --- bounded-concurrency pool ---
export async function pool<I, O>(
    items: I[],
    size: number,
    fn: (item: I) => Promise<O>,
): Promise<O[]> {
    const out = new Array<O>(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        for (;;) {
            const i = next++;
            if (i >= items.length) return;
            out[i] = await fn(items[i]!);
        }
    };
    await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
    return out;
}

// --- one LLM-judge call: structured output, thinkless (judging needs no extended reasoning) ---
export async function judge<T>(
    model: string,
    spec: { system: string; prompt: string; schema: ZodType<T> },
): Promise<T> {
    const { object } = await generateObject({
        model: resolveModel(model),
        schema: spec.schema,
        system: spec.system,
        prompt: spec.prompt,
        providerOptions: thinklessOpts(model),
    });
    return object as T;
}

// --- markdown report: accumulate lines (echoed live), then flush to --out if set ---
export function reporter(): { w: (s?: string) => void; flush: (out: string) => void } {
    const lines: string[] = [];
    const w = (s = ""): void => {
        lines.push(s);
        log(s);
    };
    const flush = (out: string): void => {
        if (!out) return;
        writeFileSync(out, lines.join("\n"));
        log(`\nreport → ${out}`);
    };
    return { w, flush };
}
