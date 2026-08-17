import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactContent, GenMeta } from "@model/artifact";
import type { EvalCheck, EvalJudgement } from "@model/eval";
import { questionRates } from "@model/eval";
import type { Surface } from "@model/ai";
import { applyPatch } from "@model/ai";
import { runGenerate } from "@services/core/ai/run";
import { withMeter, usdOf } from "@services/core/ai/meter";
import { aiReady } from "@services/core/ai/provider";
import { runChecks } from "@services/core/ai/eval/checks";
import { judgeRun } from "@services/core/ai/eval/judge";
import { judgeVisuals } from "@services/core/ai/eval/visual-judge";
import { RUBRIC } from "@services/core/ai/eval/rubric";
import { VISUAL_RUBRIC } from "@services/core/ai/eval/visual-rubric";
import { GEN_CASES } from "@services/core/ai/eval/gen-cases";
import { session, type Shooter } from "./shoot";

/**
 * Generate artifacts and hold them to every check we have. This is the tier that catches a PROMPT
 * regression: `pnpm eval:shots` renders fixed corpus content and so can only ever catch the engine.
 *
 *   pnpm eval:ci --cases 3 --judge none        free; proves the pipeline
 *   pnpm eval:ci --cases 7 --judge text        the scheduled default
 *   pnpm eval:ci --cases 7 --judge both --out out
 *
 * Needs no database: runGenerate takes no persistence, so there is no seed, no workspace, and no
 * credit gate in the way.
 *
 * What fails the build is deliberately narrow. Deterministic checks fail it, because they have no
 * variance. Judged questions fail it only where the rubric set a `gate`, which is only on questions
 * measured as saturated: the aggregate score moves ~18 points between identical runs, so gating on
 * it would fire on noise. A model error is infrastructure, counted and reported but never a red
 * build, because "the API timed out" is not "the output got worse".
 */

const arg = (name: string, fallback: string): string => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const out = (s: string): void => {
    process.stdout.write(`${s}\n`);
};

// A mistyped dispatch input should cost a coffee, not a weekend. ~$0.29 per case with both judges.
const MAX_CASES = 12;
const MAX_RUNS = 3;

type JudgeMode = "none" | "text" | "visual" | "both";

interface CaseResult {
    id: string;
    run: number;
    ok: boolean;
    error?: string;
    sections: number;
    usd: number;
    failedChecks: EvalCheck[];
    judgements: EvalJudgement[];
    visual: EvalJudgement[];
}

interface Generated {
    content: ArtifactContent;
    /** Only the beats: enough for the role-fit checks, which is all fitChecks reads meta for. */
    meta: GenMeta;
}

async function generate(prompt: string, surface: Surface, model: string): Promise<Generated> {
    let content: ArtifactContent | undefined;
    let beats: GenMeta["beats"] = [];
    const overrides = model ? { outline: model, section: model } : undefined;
    for await (const ev of runGenerate(
        { prompt, surface, theme: "studio", length: "Short" },
        { ...(overrides ? { models: overrides } : {}) },
    )) {
        if (ev.type === "plan")
            beats = ev.beats.map((b) => ({ id: b.id, label: b.label, role: b.role }));
        if (ev.type === "patch")
            content = applyPatch(
                content ?? { format: surface, theme: "studio", sections: [] },
                ev.ops,
            );
    }
    if (!content?.sections.length) throw new Error("generation produced no sections");
    return { content, meta: { at: "", models: {}, prompt, surface, beats } };
}

async function runCase(
    shoot: Shooter,
    id: string,
    prompt: string,
    surface: Surface,
    run: number,
    model: string,
    judge: JudgeMode,
    dir: string | null,
): Promise<CaseResult> {
    const base: CaseResult = {
        id,
        run,
        ok: true,
        sections: 0,
        usd: 0,
        failedChecks: [],
        judgements: [],
        visual: [],
    };
    return withMeter(async (meter) => {
        try {
            const { content, meta } = await generate(prompt, surface, model);
            base.sections = content.sections.length;

            const structural = runChecks(content, { surface, length: "Short" });
            const cap = await shoot(content, meta);
            base.failedChecks = [...structural, ...cap.checks].filter((c) => !c.pass);

            if (judge === "text" || judge === "both") base.judgements = await judgeRun(content);
            if (judge === "visual" || judge === "both")
                base.visual = await judgeVisuals(cap.shots.map((s) => ({ id: s.id, png: s.png })));

            if (dir) {
                const where = join(dir, `${id}-${run}`);
                mkdirSync(where, { recursive: true });
                writeFileSync(join(where, "_strip.png"), cap.strip);
                for (const s of cap.shots) writeFileSync(join(where, `${s.id}.png`), s.png);
                writeFileSync(join(where, "content.json"), JSON.stringify(content, null, 2));
            }
        } catch (e) {
            // infrastructure, not quality: reported and counted, never a red build
            base.ok = false;
            base.error = e instanceof Error ? e.message : String(e);
        }
        base.usd = usdOf(meter.uses);
        return base;
    }, false);
}

async function main(): Promise<void> {
    if (!aiReady()) {
        out("no AI provider configured (GOOGLE_API_KEY); nothing to run");
        process.exit(1);
    }
    const judge = arg("judge", "text") as JudgeMode;
    const model = arg("model", "");
    const dir = process.argv.includes("--out") ? arg("out", "eval-out") : null;
    const runs = Math.min(MAX_RUNS, Math.max(1, Number(arg("runs", "1")) || 1));
    const want = Math.min(MAX_CASES, Math.max(1, Number(arg("cases", "3")) || 3));
    const cases = GEN_CASES.slice(0, want);
    if (dir) mkdirSync(dir, { recursive: true });

    out(`${cases.length} case(s) × ${runs} run(s) · judge=${judge}${model ? ` · ${model}` : ""}`);

    const results: CaseResult[] = [];
    await session(async (shoot) => {
        for (const c of cases)
            for (let r = 1; r <= runs; r++) {
                const res = await runCase(shoot, c.id, c.prompt, c.surface, r, model, judge, dir);
                results.push(res);
                out(
                    res.ok
                        ? `  ${c.id}#${r} ${res.sections} sections · ${res.failedChecks.length} failed checks · $${res.usd.toFixed(3)}`
                        : `  ${c.id}#${r} ERROR ${res.error}`,
                );
            }
    });

    const errored = results.filter((r) => !r.ok);
    const checkFailures = results.flatMap((r) => r.failedChecks);
    const rates = [
        ...questionRates(
            RUBRIC,
            results.flatMap((r) => r.judgements),
        ),
        ...questionRates(
            VISUAL_RUBRIC,
            results.flatMap((r) => r.visual),
        ),
    ].filter((g) => g.answered > 0);
    const gates = rates.filter((g) => g.floor !== null);
    const usd = results.reduce((n, r) => n + r.usd, 0);

    out("");
    for (const c of checkFailures)
        out(`  ✗ ${c.target} ${c.id}${c.detail ? ` — ${c.detail}` : ""}`);
    // every question reported; only the gated ones can fail the build
    for (const g of [...rates].sort((a, b) => a.rate - b.rate))
        out(
            `  ${g.floor === null ? " " : g.pass ? "·" : "✗"} ${g.id.padEnd(26)} ${(g.rate * 100).toFixed(0).padStart(3)}%` +
                `${g.floor === null ? "" : ` (floor ${(g.floor * 100).toFixed(0)}%)`} n=${g.answered}`,
        );
    out("");
    out(`spent $${usd.toFixed(2)} · ${errored.length} run(s) errored`);

    if (dir) {
        writeFileSync(
            join(dir, "summary.json"),
            JSON.stringify({ results, rates, usd, errored: errored.length }, null, 2),
        );
        out(`summary + renders → ${dir}/`);
    }

    const failed = checkFailures.length > 0 || gates.some((g) => !g.pass);
    if (failed) out("FAILED: a deterministic check or a gated question is below its floor");
    process.exit(failed ? 1 : 0);
}

main().catch((e: unknown) => {
    process.stderr.write(`${String(e)}\n`);
    process.exit(1);
});
