import "dotenv/config";
import { z } from "zod";
import { structured } from "./llm";
import { MODELS } from "./models";

// Latency benchmark: how fast does each model return a real, schema-constrained section write? This is the
// hot path of the generate pipeline (one call per section), so its speed drives total generation time.
// Run: `pnpm agent:bench` (optionally pass model keys as args to limit the set).

const SchemaZ = z.object({
    elements: z
        .array(
            z.object({
                kind: z.enum(["eyebrow", "heading", "paragraph", "bullets", "stat"]),
                text: z.string().optional(),
                items: z.array(z.string()).optional(),
                value: z.string().optional(),
                label: z.string().optional(),
            }),
        )
        .min(3)
        .max(6),
});

const SYSTEM =
    "You are the writer for a deck tool. Return a section's content as an 'elements' list: an eyebrow, an h1/h2 heading, a lead paragraph, and 2–3 stats or bullets. Real, specific, confident copy — no placeholders.";
const USER =
    "Make a deck. Brief: a seed-round pitch for Mise, which turns a restaurant's POS, invoices, and suppliers into one live system that forecasts prep and automates ordering. Write the 'proof' section — concrete numbers on margin recovered and time saved.";

const ALL = [
    "claude-opus-4-8",
    "claude-sonnet-5",
    "claude-haiku-4-5",
    "gpt-4o",
    "gpt-4o-mini",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "grok-3",
    "command-a",
];

const RUNS = 2; // measured runs per model (report best, to discount one-off network jitter)

async function timeOne(key: string): Promise<number> {
    const start = Date.now();
    const out = await structured({
        model: key,
        schema: SchemaZ,
        system: SYSTEM,
        user: USER,
        maxTokens: 1200,
    });
    if (!out.elements?.length) throw new Error("empty");
    return Date.now() - start;
}

async function main(): Promise<void> {
    const keys = process.argv.slice(2).filter((k) => MODELS[k]);
    const models = keys.length ? keys : ALL;
    process.stdout.write(`section-write latency — best of ${RUNS} runs\n\n`);
    const results: { key: string; provider: string; ms: number | null }[] = [];
    for (const key of models) {
        const def = MODELS[key];
        const label = `${(def?.provider ?? "?").padEnd(10)} ${key.padEnd(20)}`;
        let best: number | null = null;
        let err = "";
        for (let i = 0; i < RUNS; i++) {
            try {
                const ms = await timeOne(key);
                best = best === null ? ms : Math.min(best, ms);
            } catch (e) {
                err = (e as Error).message.slice(0, 60);
            }
        }
        results.push({ key, provider: def?.provider ?? "?", ms: best });
        process.stdout.write(
            best !== null
                ? `${label} ${String(best).padStart(6)} ms\n`
                : `${label}    ERR  ${err}\n`,
        );
    }
    const ok = results
        .filter((r) => r.ms !== null)
        .sort((a, b) => (a.ms as number) - (b.ms as number));
    if (ok.length) {
        process.stdout.write(`\nfastest → slowest:\n`);
        for (const r of ok)
            process.stdout.write(`  ${r.key.padEnd(20)} ${String(r.ms).padStart(6)} ms\n`);
    }
}

main().catch((e) => {
    process.stderr.write(`${e}\n`);
    process.exit(1);
});
