import "dotenv/config";
import { complete, MODELS } from "./llm";

// Smoke test: can we actually reach each provider's API with the configured key + a real model id? One
// representative model per provider. Run: `pnpm agent:ping`.
const SAMPLES = ["claude-haiku-4-5", "gpt-4o-mini", "gemini-2.5-flash", "grok-3", "command-a"];

async function main(): Promise<void> {
    process.stdout.write("provider smoke test — one call per provider\n\n");
    for (const key of SAMPLES) {
        const def = MODELS[key];
        const label = `${(def?.provider ?? "?").padEnd(10)} ${(def?.id ?? key).padEnd(28)}`;
        const start = Date.now();
        try {
            const out = await complete({
                model: key,
                user: "Reply with exactly: OK",
                maxTokens: 16,
            });
            const ms = Date.now() - start;
            process.stdout.write(
                `✓ ${label} ${ms}ms  → ${JSON.stringify(out.trim().slice(0, 24))}\n`,
            );
        } catch (e) {
            const msg = String((e as Error).message)
                .replace(/\s+/g, " ")
                .slice(0, 100);
            process.stdout.write(`✗ ${label} ${msg}\n`);
        }
    }
    process.exit(0);
}

main().catch((e: unknown) => {
    process.stderr.write(`${String(e)}\n`);
    process.exit(1);
});
