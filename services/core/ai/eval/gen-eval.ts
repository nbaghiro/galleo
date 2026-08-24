import { DEMO_EMAIL } from "@services/db/seed/workspaces";
import { z } from "zod";
import type { GenerateInput } from "@model/ai";
import { applyPatch } from "@model/ai";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { eq } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { withMeter } from "@services/core/ai/meter";
import { runGenerate } from "@services/core/ai/run";
import { expandBrief } from "@services/core/ai/tools/plan";
import { recordRun, saveJudgements } from "./runs";
import { runChecks } from "./checks";
import { judgeRun } from "./judge";
import { GEN_CASES, type GenCase } from "./gen-cases";
import { arg, avg, hasFlag, int, judge, list, log, pool, reporter, shortModel } from "./kit";

const RUNS = int("runs", 1);
const GEN_MODELS = list("gen-models", "google:gemini-2.5-flash");
const JUDGE_MODEL = arg("judge-model", "google:gemini-2.5-flash");
const LENGTH = arg("length", "Short");
const FILTER = arg("filter", "");
const CONCURRENCY = int("concurrency", 2); // generation is heavy
const OUT = arg("out", "");
// --save writes each generation into eval_runs so the playground has something to show; --judge
// adds the checklist verdict, which is what makes the matrix legible
const SAVE = hasFlag("save");
const CHECKLIST = hasFlag("judge");

/** The account the playground reads as; runs are written against its workspace. */
async function demoOwner(): Promise<{ userId: string; workspaceId: string }> {
    const [u] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, DEMO_EMAIL));
    if (!u) throw new Error(`no ${DEMO_EMAIL} user — run \`pnpm db:seed\` first`);
    const [m] = await db
        .select({ ws: schema.members.workspaceId })
        .from(schema.members)
        .where(eq(schema.members.userId, u.id));
    if (!m) throw new Error(`${DEMO_EMAIL} has no workspace`);
    return { userId: u.id, workspaceId: m.ws };
}

function collect(el: ElementInstance | undefined, kinds: string[], texts: string[]): void {
    if (!el) return;
    if (el.type !== "container") kinds.push(el.type); // scaffolding names no kind
    const d = el.data as { text?: string; children?: ElementInstance[] };
    if (typeof d.text === "string" && d.text.trim()) texts.push(d.text.trim());
    for (const k of d.children ?? []) collect(k, kinds, texts);
}
function describe(content: ArtifactContent): string {
    const secs = content.sections.map((s, i) => {
        const kinds: string[] = [];
        const texts: string[] = [];
        collect(s.root, kinds, texts);
        const bg = s.background?.kind === "image" ? " +bg-image" : "";
        const els = [...new Set(kinds)].join(", ") || "—";
        return `Section ${i + 1} [${els}${bg}]\n${texts.join("\n")}`;
    });
    return `Format: ${content.format} · ${content.sections.length} sections\n\n${secs.join("\n\n")}`;
}

/** Runs one generation, records it as an eval run when --save, and returns what the report needs. */
async function generateAndSave(
    model: string,
    c: GenCase,
    owner: { userId: string; workspaceId: string } | null,
): Promise<{ content: ArtifactContent; ms: number; error?: string }> {
    if (!owner) return generate(model, c);
    // Only the generation runs inside the meter. The judge is a separate act of measurement, and
    // metering it here would record its checklist calls as spans of the run it is judging.
    const { g, checks, spans } = await withMeter(async (meter) => {
        const gen = await generate(model, c);
        return {
            g: gen,
            checks: gen.content.sections.length
                ? runChecks(gen.content, { surface: c.surface, length: c.length ?? LENGTH })
                : [],
            spans: meter.uses,
        };
    }, true);

    let judgements = undefined;
    if (CHECKLIST && g.content.sections.length && !g.error) {
        try {
            judgements = await judgeRun(g.content, { reference: c.reference });
        } catch (e) {
            log(`  judge failed for ${c.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    {
        const id = await recordRun({
            workspaceId: owner.workspaceId,
            userId: owner.userId,
            config: {
                kind: "generate",
                meta: {
                    at: new Date().toISOString(),
                    models: { generate: model, outline: model, section: model },
                    prompt: c.prompt,
                    surface: c.surface,
                    length: c.length ?? LENGTH,
                    theme: "studio",
                },
            },
            spans,
            checks,
            content: g.content,
            status: g.error ? "error" : "ok",
            error: g.error,
            credits: 0,
            ms: g.ms,
        });
        if (judgements && id) await saveJudgements(owner.workspaceId, id, judgements);
    }
    return g;
}

async function generate(
    model: string,
    c: GenCase,
): Promise<{ content: ArtifactContent; ms: number; error?: string }> {
    // The studio expands the raw prompt into a brief before it plans, so the batch does too:
    // otherwise a batch run is one model call shorter than the flow it is supposed to measure.
    const brief = await expandBrief(c.prompt, c.surface, { models: { brief: model } }).catch(
        () => null,
    );
    const input: GenerateInput = {
        prompt: c.prompt,
        surface: c.surface,
        theme: "studio",
        length: brief?.length ?? c.length ?? LENGTH,
        ...(brief?.goal ? { goal: brief.goal } : {}),
        ...(brief?.audience ? { audience: brief.audience } : {}),
        ...(brief?.tone ? { tone: brief.tone } : {}),
        ...(brief?.mustInclude?.length ? { mustInclude: brief.mustInclude } : {}),
    };
    let content: ArtifactContent = { format: c.surface, theme: "studio", sections: [] };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 300_000);
    const t0 = Date.now();
    try {
        for await (const ev of runGenerate(input, {
            models: { generate: model, outline: model, section: model },
            signal: ctrl.signal,
        })) {
            if (ev.type === "patch") content = applyPatch(content, ev.ops);
            else if (ev.type === "error") throw new Error(ev.message);
        }
    } catch (e) {
        clearTimeout(timer);
        return { content, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
    }
    clearTimeout(timer);
    return { content, ms: Date.now() - t0 };
}

const JUDGE_SCHEMA = z.object({
    overall: z.number().min(1).max(5),
    specificity: z.number().min(1).max(5), // real, concrete copy vs generic AI-slop
    arc: z.number().min(1).max(5), // narrative structure across the sections
    variety: z.number().min(1).max(5), // layout / element / visual variety
    voice: z.number().min(1).max(5), // tone + craft
    reason: z.string(),
});
type Judgement = z.infer<typeof JUDGE_SCHEMA>;
const AXES = ["overall", "specificity", "arc", "variety", "voice"] as const;

function scoreGen(c: GenCase, gen: ArtifactContent): Promise<Judgement> {
    return judge(JUDGE_MODEL, {
        schema: JUDGE_SCHEMA,
        system: "You are a demanding creative director and editor. You are shown an EXCELLENT hand-built REFERENCE artifact and a GENERATED artifact for a brief. Score the GENERATED one 1–5 on how close it gets to the reference's craft, per axis. Be strict: 5 = indistinguishable from hand-crafted, 3 = decent but clearly AI, 1 = generic slop / walls of text / placeholder-feeling copy. The reference is only a QUALITY BAR — do NOT penalize a different topic; judge craft, not subject.",
        prompt: `BRIEF: ${c.prompt}\n\n=== REFERENCE — excellent hand-built ${c.reference.format} (${c.referenceName}) ===\n${describe(c.reference).slice(0, 6500)}\n\n=== GENERATED — ${gen.format} ===\n${describe(gen).slice(0, 6500)}`,
    });
}

interface Result {
    model: string;
    c: GenCase;
    j?: Judgement;
    ms: number;
    error?: string;
}
interface Agg {
    scores: Record<(typeof AXES)[number], number[]>;
    ms: number[];
    errors: number;
}
const blankAgg = (): Agg => ({
    scores: { overall: [], specificity: [], arc: [], variety: [], voice: [] },
    ms: [],
    errors: 0,
});

export async function runGenEval(): Promise<void> {
    const cases = GEN_CASES.filter(
        (c) => !FILTER || c.id.includes(FILTER) || c.surface.includes(FILTER),
    );
    const tasks = GEN_MODELS.flatMap((model) =>
        cases.flatMap((c) => Array.from({ length: RUNS }, () => ({ model, c }))),
    );
    const owner = SAVE ? await demoOwner() : null;
    log(
        `Gen eval: ${cases.length} briefs × ${RUNS} runs × ${GEN_MODELS.length} gen-model(s) = ${tasks.length} generations · judge ${shortModel(JUDGE_MODEL)}`,
    );
    if (owner)
        log(
            `Saving runs to the playground (workspace ${owner.workspaceId})${CHECKLIST ? " with checklist verdicts" : ""}`,
        );
    let done = 0;
    const results = await pool(tasks, CONCURRENCY, async (t): Promise<Result> => {
        const g = await generateAndSave(t.model, t.c, owner);
        let j: Judgement | undefined;
        let error = g.error;
        if (!error) {
            try {
                j = await scoreGen(t.c, g.content);
            } catch (e) {
                error = `judge: ${e instanceof Error ? e.message : String(e)}`;
            }
        }
        done++;
        log(
            `  … ${done}/${tasks.length}  ${shortModel(t.model)}/${t.c.id}${error ? ` ERR: ${error}` : ` J${j?.overall}`}`,
        );
        return { model: t.model, c: t.c, j, ms: g.ms, error };
    });

    const byModel = new Map<string, Agg>();
    const byCell = new Map<string, Agg>();
    for (const model of GEN_MODELS) byModel.set(model, blankAgg());
    for (const r of results) {
        const mm = byModel.get(r.model)!;
        const cell = byCell.get(`${r.model}|${r.c.id}`) ?? blankAgg();
        if (r.error || !r.j) {
            mm.errors++;
            cell.errors++;
        } else {
            mm.ms.push(r.ms);
            cell.ms.push(r.ms);
            for (const a of AXES) {
                mm.scores[a].push(r.j[a]);
                cell.scores[a].push(r.j[a]);
            }
        }
        byCell.set(`${r.model}|${r.c.id}`, cell);
    }

    const { w, flush } = reporter();
    w(`# Generation-quality eval — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    w(
        `\n${cases.length} briefs · ${RUNS} run(s) · judged vs hand-built demos by ${shortModel(JUDGE_MODEL)}\n`,
    );
    w("## Overall (1–5, higher = closer to demo craft)");
    w(`| gen model | overall | specificity | arc | variety | voice | gen latency | errors |`);
    w(`|---|---|---|---|---|---|---|---|`);
    for (const model of GEN_MODELS) {
        const mm = byModel.get(model)!;
        const cells = AXES.map((a) => (mm.scores[a].length ? avg(mm.scores[a]).toFixed(1) : "–"));
        w(
            `| ${shortModel(model)} | **${cells[0]}** | ${cells[1]} | ${cells[2]} | ${cells[3]} | ${cells[4]} | ${(avg(mm.ms) / 1000).toFixed(0)}s | ${mm.errors} |`,
        );
    }
    w("\n## Per brief (overall)");
    w(`| brief | surface | reference | ${GEN_MODELS.map(shortModel).join(" | ")} |`);
    w(`|---|---|---|${GEN_MODELS.map(() => "---").join("|")}|`);
    for (const c of cases) {
        const cells = GEN_MODELS.map((model) => {
            const cell = byCell.get(`${model}|${c.id}`)!;
            if (cell.errors && !cell.scores.overall.length) return "🛑";
            return avg(cell.scores.overall).toFixed(1);
        });
        w(`| ${c.id} | ${c.surface} | ${c.referenceName} | ${cells.join(" | ")} |`);
    }
    w("\n## Sample judge notes");
    const seen = new Set<string>();
    for (const r of results) {
        const k = `${r.model}|${r.c.id}`;
        if (r.j && !seen.has(k)) {
            seen.add(k);
            w(`- **${shortModel(r.model)} / ${r.c.id}** (J${r.j.overall}): ${r.j.reason}`);
        }
    }
    flush(OUT);
}
