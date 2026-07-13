import { z } from "zod";
import type { GenerateInput } from "@model/ai";
import { applyPatch } from "@model/ai";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { runGenerate } from "../run";
import { GEN_CASES, type GenCase } from "./gen-cases";
import { arg, avg, int, judge, list, log, pool, reporter, shortModel } from "./kit";

const RUNS = int("runs", 1);
const GEN_MODELS = list("gen-models", "google:gemini-2.5-flash");
const JUDGE_MODEL = arg("judge-model", "google:gemini-2.5-flash");
const LENGTH = arg("length", "Short");
const FILTER = arg("filter", "");
const CONCURRENCY = int("concurrency", 2); // generation is heavy
const OUT = arg("out", "");

function collect(el: ElementInstance | undefined, kinds: string[], texts: string[]): void {
    if (!el) return;
    if (el.type !== "group") kinds.push(el.type);
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

async function generate(
    model: string,
    c: GenCase,
): Promise<{ content: ArtifactContent; ms: number; error?: string }> {
    const input: GenerateInput = {
        prompt: c.prompt,
        surface: c.surface,
        theme: "studio",
        length: c.length ?? LENGTH,
    };
    let content: ArtifactContent = { format: c.surface, theme: "studio", sections: [] };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 300_000);
    const t0 = Date.now();
    try {
        for await (const ev of runGenerate(input, { model, signal: ctrl.signal })) {
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
    log(
        `Gen eval: ${cases.length} briefs × ${RUNS} runs × ${GEN_MODELS.length} gen-model(s) = ${tasks.length} generations · judge ${shortModel(JUDGE_MODEL)}`,
    );
    let done = 0;
    const results = await pool(tasks, CONCURRENCY, async (t): Promise<Result> => {
        const g = await generate(t.model, t.c);
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
