import "dotenv/config";
import type { ToolId } from "@model/tools";
import { TOOLS } from "@model/tools";
import { generationReport, traceSummary } from "@services/core/traces";
import { assertDatabaseUrl } from "@services/db/client";

// pnpm traces [--since 7d|24h|2026-09-01] [--tool write-beats] [--workspace <id>] [--generation <id>] [--json]
// The reader the eval playground used to be: what every call cost, how the provider's cache did,
// and how often the section writer needed a second try, from the traces table.

const arg = (name: string): string | undefined => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
const flagOn = (name: string): boolean => process.argv.includes(`--${name}`);
const out = (s: string): void => {
    process.stdout.write(`${s}\n`);
};

function sinceOf(raw: string | undefined): Date {
    const m = /^(\d+)([dh])$/.exec(raw ?? "7d");
    if (m) return new Date(Date.now() - Number(m[1]) * (m[2] === "d" ? 86_400_000 : 3_600_000));
    const d = new Date(raw ?? "");
    if (Number.isNaN(d.getTime())) throw new Error(`--since wants 7d, 24h or a date, not "${raw}"`);
    return d;
}

const pad = (v: string | number, w: number, right = false): string => {
    const s = String(v);
    return right ? s.padStart(w) : s.padEnd(w);
};
const table = (head: string[], rows: (string | number)[][], right: boolean[]): void => {
    const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
    out(head.map((h, i) => pad(h, widths[i]!, right[i])).join("  "));
    for (const r of rows) out(r.map((c, i) => pad(c, widths[i]!, right[i])).join("  "));
};

async function main(): Promise<void> {
    assertDatabaseUrl();
    const generation = arg("generation");
    if (generation) {
        const rows = await generationReport(generation);
        if (flagOn("json")) return out(JSON.stringify(rows, null, 2));
        if (!rows.length) return out("no traces for that generation");
        table(
            ["at", "tool", "status", "ms", "calls", "in", "out", "credits", "flags"],
            rows.map((r) => [
                r.at.slice(11, 19),
                r.tool,
                r.error ? `${r.status} (${r.error})` : r.status,
                r.ms,
                r.calls,
                r.tokensIn,
                r.tokensOut,
                r.credits,
                r.flags.join(","),
            ]),
            [false, false, false, true, true, true, true, true, false],
        );
        const total = rows.reduce(
            (a, r) => ({ ms: a.ms + r.ms, credits: a.credits + r.credits, in: a.in + r.tokensIn }),
            { ms: 0, credits: 0, in: 0 },
        );
        return out(
            `\n${rows.length} calls · ${total.ms} ms · ${total.in} tokens in · ${total.credits} credits`,
        );
    }
    const tool = arg("tool");
    if (tool && !(tool in TOOLS)) throw new Error(`no tool called "${tool}"`);
    const summary = await traceSummary({
        since: sinceOf(arg("since")),
        ...(tool ? { tool: tool as ToolId } : {}),
        ...(arg("workspace") ? { workspaceId: arg("workspace") } : {}),
    });
    if (flagOn("json")) return out(JSON.stringify(summary, null, 2));
    out("Model calls by tool and model");
    table(
        ["tool", "model", "traces", "calls", "p50 ms", "p95 ms", "in", "out", "cached"],
        summary.calls.map((r) => [
            r.tool,
            r.model,
            r.traces,
            r.calls,
            r.p50Ms,
            r.p95Ms,
            r.tokensIn,
            r.tokensOut,
            `${r.cachedPct}%`,
        ]),
        [false, false, true, true, true, true, true, true, true],
    );
    out("\nOutcomes by tool");
    table(
        ["tool", "status", "count", "credits", "p50 ms"],
        summary.outcomes.map((r) => [
            r.tool,
            r.error ? `${r.status} (${r.error})` : r.status,
            r.count,
            r.credits,
            r.p50Ms,
        ]),
        [false, false, true, true, true],
    );
    const s = summary.sections;
    out(
        `\nSection writer: first call of a run ${s.first.cachedPct}% cached over ${s.first.calls} calls · later calls ${s.later.cachedPct}% cached over ${s.later.calls} calls`,
    );
    const r = summary.retries;
    out(
        `Beats written ${r.beats} · needed a second call ${r.retried} · landed unchecked ${r.unchecked}`,
    );
}

main()
    .then(() => process.exit(0))
    .catch((e: unknown) => {
        process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
        process.exit(1);
    });
