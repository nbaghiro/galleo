import "dotenv/config";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { out, warn } from "@services/utils/env";
import { MODELS, PROVIDER_LABEL, type Provider } from "@services/core/models";
import { modelCall, providerReady } from "@services/core/ai/provider";
import { runChat } from "@services/core/ai/chat";
import { planOutlineFor } from "@services/core/ai/tools/plan";
import { drain, makeContext } from "@services/core/ai/tools";
import type { Beat, GenerateInput } from "@model/ai";

// Does each registered model actually answer, with the key this environment holds? `check:models`
// proves an id is one the SDK declares; only a real call proves the key works, the account has
// access, and the id is still served. Costs money, so it runs on request, never in CI.
//
//   pnpm ai:probe                        every model a configured provider serves
//   pnpm ai:probe --provider=anthropic   one provider
//   pnpm ai:probe --model=openai:gpt-5.5 one model
//   pnpm ai:probe --json                 also check structured output, which the pipeline leans on
//   pnpm ai:probe --turn                 run the REAL flows: the outline plan → a full chat turn
//   pnpm ai:probe --turn --sections=12   plan at the size the studio really asks for (default 3)

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
// the outline the studio really asks for is a dozen beats, not three; a small one is cheap but is
// also an easier ask, so the size is a knob when comparing models on a realistic outline
const sections = Number(flag("sections")) || 3;

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

const filled = (s: string | undefined): boolean => !!s?.trim();

/**
 * Whether an outline is usable, not merely present. Counting beats passed a model that returned
 * three empty ones and painted a blank board, so every field the studio renders is checked and the
 * failure names which were missing and on how many beats: this is read while comparing models.
 * A label or role missing anywhere fails, since both are structural. Substance (takeaway, points or
 * brief) is allowed to be absent on a spare cover or close, so it fails at half.
 */
function outlineGaps(beats: Beat[]): string | null {
    if (!beats.length) return "no beats came back";
    const noLabel = beats.filter((b) => !filled(b.label)).length;
    const noRole = beats.filter((b) => !filled(b.role)).length;
    const noSay = beats.filter(
        (b) => !filled(b.takeaway) && !filled(b.brief) && !(b.points ?? []).some(filled),
    ).length;
    const gaps = [
        noLabel && `${noLabel} missing label`,
        noRole && `${noRole} missing role`,
        noSay && `${noSay} missing takeaway, points and brief`,
    ].filter((g): g is string => !!g);
    const fatal = noLabel > 0 || noRole > 0 || noSay * 2 >= beats.length;
    return gaps.length && fatal ? `${beats.length} beats, ${gaps.join(", ")}` : null;
}

// The product's own flows, not a synthetic call: the studio's plan, and a full chat turn with its
// real toolset. A model can answer a one-line prompt and a toy schema and still fail here on
// schema size, tool calling, or a reasoning-only reply.
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

    try {
        const input: GenerateInput = { prompt: PROMPT, surface: "deck", theme: "studio" };
        const outline = await timed("outline", () =>
            drain(
                planOutlineFor(
                    input,
                    makeContext({
                        models: { outline: id },
                        maxSections: sections,
                        signal,
                        // the real turn sources a backdrop; stock is the product default and needs no key
                        image: { source: "stock" },
                    }),
                ),
            ),
        );
        // the planner reads the brief itself now, so its reading is checked with the arc
        const blank = (["goal", "audience", "tone"] as const).filter((k) => !outline[k]?.trim());
        if (blank.length) return `outline: no ${blank.join(", no ")}`;
        const gaps = outlineGaps(outline.beats);
        if (gaps) return `outline: ${gaps}`;
    } catch (e) {
        return `outline: ${reason(e)}`;
    }

    try {
        let failed: string | null = null;
        await timed("chat", async () => {
            for await (const ev of runChat(
                { message: "What could this deck cover?", context: { surface: "library" } },
                makeContext({ image: {}, models: { chat: id }, signal }),
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
    const call = modelCall(id, 0);
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    try {
        const { text } = await generateText({
            ...call,
            prompt: "Reply with the single word: ready",
            maxOutputTokens: MAX_TOKENS,
            // a probe wants the first answer, not resilience: retries turn a permanent error into a
            // ten-second wait and bury the cause behind "failed after 3 attempts"
            maxRetries: 0,
            abortSignal: signal,
        });
        if (checkJson) {
            await generateObject({
                ...call,
                schema: z.object({ ok: z.boolean() }),
                prompt: 'Return {"ok": true}.',
                maxRetries: 0,
                abortSignal: signal,
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
