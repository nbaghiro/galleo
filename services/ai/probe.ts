import "dotenv/config";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { out, warn } from "../log";
import { MODELS, PROVIDER_LABEL, samplingFor, type Provider } from "./models";
import { providerReady, resolveModel, providerOpts } from "./provider";
import { runPlan } from "./run";
import { runChat } from "./chat";
import { expandBrief } from "./brief";
import type { GenerateInput } from "@model/ai";

// Does each registered model actually answer, with the key this environment holds? `check:models`
// proves an id is one the SDK declares; only a real call proves the key works, the account has
// access, and the id is still served. Costs money, so it runs on request, never in CI.
//
//   pnpm ai:probe                        every model a configured provider serves
//   pnpm ai:probe --provider=anthropic   one provider
//   pnpm ai:probe --model=openai:gpt-5.5 one model
//   pnpm ai:probe --json                 also check structured output, which the pipeline leans on
//   pnpm ai:probe --turn                 run the REAL flows: brief → outline plan → a full chat turn

const args = process.argv.slice(2);
const flag = (name: string): string | undefined =>
    args
        .find((a) => a.startsWith(`--${name}=`))
        ?.split("=")
        .slice(1)
        .join("=");
const has = (name: string): boolean => args.includes(`--${name}`);

const onlyProvider = flag("provider");
const onlyModel = flag("model");
const checkJson = has("json");
const checkTurn = has("turn");

const TIMEOUT_MS = 60_000;
// a reasoning model spends its budget thinking before it writes anything, so a tight cap comes back
// as a successful call with empty text
const MAX_TOKENS = 512;
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const reason = (e: unknown): string =>
    clip((e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").trim(), 120);

interface Result {
    id: string;
    ok: boolean;
    ms: number;
    note: string;
}

// The product's own flows, not a synthetic call: the brief expansion, the studio's plan turn, and a
// full chat turn with its real toolset. A model can answer a one-line prompt and a toy schema and
// still fail here on schema size, tool calling, or a reasoning-only reply.
async function realFlows(id: string, signal: AbortSignal): Promise<string | null> {
    const PROMPT = "A short launch deck for a note-taking app";
    const step: Record<string, number> = {};
    const timed = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
        const t0 = Date.now();
        try {
            return await run();
        } finally {
            step[name] = Date.now() - t0;
        }
    };
    const timings = (): string =>
        Object.entries(step)
            .map(([k, ms]) => `${k} ${(ms / 1000).toFixed(1)}s`)
            .join("  ");
    let brief;
    try {
        brief = await timed("brief", () =>
            expandBrief(PROMPT, "deck", { models: { brief: id }, signal }),
        );
        if (!brief.goal && !brief.audience && !brief.tone) return "brief: came back empty";
    } catch (e) {
        return `brief: ${reason(e)}`;
    }

    try {
        const input: GenerateInput = {
            prompt: PROMPT,
            surface: "deck",
            theme: "studio",
            goal: brief.goal,
            audience: brief.audience,
            tone: brief.tone,
        };
        let beats = 0;
        let planError: string | null = null;
        await timed("outline", async () => {
            for await (const ev of runPlan(input, {
                models: { outline: id },
                maxSections: 3,
                signal,
                // the real turn sources a backdrop; stock is the product default and needs no key
                image: { source: "stock" },
            })) {
                if (ev.type === "error") planError = clip(ev.message, 110);
                if (ev.type === "plan") beats = ev.beats.length;
            }
        });
        if (planError) return `outline: ${planError}`;
        if (!beats) return "outline: no beats came back";
    } catch (e) {
        return `outline: ${reason(e)}`;
    }

    try {
        let failed: string | null = null;
        await timed("chat", async () => {
            for await (const ev of runChat(
                { message: "What could this deck cover?", context: { surface: "library" } },
                { models: { chat: id }, signal },
            )) {
                if (ev.type === "error") failed = ev.message;
                // the agent catches its own stream errors and reports them as prose
                if (ev.type === "chat.text" && ev.delta.includes("I couldn't finish that"))
                    failed = ev.delta.replace(/[_()\n]/g, "").trim();
            }
        });
        if (failed) return `chat: ${clip(failed, 110)}`;
    } catch (e) {
        return `chat: ${reason(e)}`;
    }
    out(`    ${timings()}`);
    return null;
}

async function probe(id: string): Promise<Result> {
    const started = Date.now();
    const model = resolveModel(id);
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    try {
        const { text } = await generateText({
            model,
            prompt: "Reply with the single word: ready",
            maxOutputTokens: MAX_TOKENS,
            // a probe wants the first answer, not resilience: retries turn a permanent error into a
            // ten-second wait and bury the cause behind "failed after 3 attempts"
            maxRetries: 0,
            abortSignal: signal,
            providerOptions: providerOpts(id),
            ...samplingFor(id, 0),
        });
        if (checkJson) {
            await generateObject({
                model,
                schema: z.object({ ok: z.boolean() }),
                prompt: 'Return {"ok": true}.',
                maxRetries: 0,
                abortSignal: signal,
                providerOptions: providerOpts(id),
                ...samplingFor(id, 0),
            });
        }
        if (checkTurn) {
            const bad = await realFlows(id, signal);
            if (bad) return { id, ok: false, ms: Date.now() - started, note: bad };
        }
        return {
            id,
            ok: true,
            ms: Date.now() - started,
            note: clip(text.trim().replace(/\s+/g, " "), 40) || "(empty reply)",
        };
    } catch (e) {
        return { id, ok: false, ms: Date.now() - started, note: reason(e) };
    }
}

async function main(): Promise<void> {
    const wanted = MODELS.filter(
        (m) => (!onlyProvider || m.provider === onlyProvider) && (!onlyModel || m.id === onlyModel),
    );
    if (!wanted.length) {
        warn(`No model matches ${onlyModel ?? onlyProvider ?? "the filter"}.`);
        process.exitCode = 1;
        return;
    }

    const skipped = new Set<Provider>();
    const results: Result[] = [];
    for (const m of wanted) {
        if (!providerReady(m.provider)) {
            skipped.add(m.provider);
            continue;
        }
        // sequential on purpose: a rate-limit burst would read as a broken key
        const r = await probe(m.id);
        out(`${r.ok ? "✓" : "✗"} ${m.id.padEnd(34)} ${String(r.ms).padStart(6)}ms  ${r.note}`);
        results.push(r);
    }

    for (const p of skipped) warn(`- ${PROVIDER_LABEL[p]}: no API key set, skipped`);

    const failed = results.filter((r) => !r.ok);
    out("");
    out(
        `${results.length - failed.length}/${results.length} answered${checkJson ? " + structured" : ""}${checkTurn ? " + real turns" : ""}`,
    );
    if (failed.length) process.exitCode = 1;
}

await main();
