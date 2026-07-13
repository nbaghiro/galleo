import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { ChatBlock, ChatContext, ChatInput, ChatLibrary, ChatTurnRef } from "@model/ai";
import { applyPatch } from "@model/ai";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { limitsFor } from "@model/billing";
import { db, schema } from "../../schema";
import { makeWorkspaceReader } from "../../api/workspace-reader";
import { runChat } from "../chat";
import { EVAL_CASES, type EvalCase, type Step } from "./cases";
import { arg, avg, hasFlag, int, judge, list, log, pct, pool, reporter, shortModel } from "./kit";

// The AGENT eval — runs each case in cases.ts through the REAL runChat agent (real tools, real DB) against
// one or more models, N times each, scoring tool routing + argument correctness + (with --judge) reply
// quality, across single- and multi-turn conversations. Errors are tracked separately from routing misses.

const DEMO_EMAIL = "demo@galleo.app";
const RUNS = int("runs", 3);
const MODELS = list("models", "google:gemini-2.5-pro,google:gemini-3.5-flash");
const FILTER = arg("filter", "");
const CONCURRENCY = int("concurrency", 4);
const OUT = arg("out", "");
const JUDGE = hasFlag("judge");
const JUDGE_MODEL = arg("judge-model", "google:gemini-2.5-flash");

const fmtLabel = (id: string): string => (id === "web" ? "Site" : id === "doc" ? "Doc" : "Deck");
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ---- environment: the demo workspace, its library, a sample open artifact, + id resolvers ----
interface Env {
    workspace: ReturnType<typeof makeWorkspaceReader>;
    library: ChatLibrary;
    sample: ArtifactContent;
    plan: string;
    credits: { remaining: number; limit: number };
    artifactId(titleSubstr: string): string | undefined;
    folderId(name: string): string | undefined;
}

async function loadEnv(): Promise<Env> {
    const [u] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, DEMO_EMAIL));
    if (!u) throw new Error(`no demo user ${DEMO_EMAIL} — run \`pnpm seed\` first`);
    const [m] = await db
        .select({ ws: schema.members.workspaceId })
        .from(schema.members)
        .where(eq(schema.members.userId, u.id));
    if (!m) throw new Error("demo user has no workspace");
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, m.ws));
    if (!ws) throw new Error("workspace not found");

    const rows = await db
        .select({
            id: schema.artifacts.id,
            title: schema.artifacts.title,
            formatId: schema.artifacts.formatId,
            draftContent: schema.artifacts.draftContent,
        })
        .from(schema.artifacts)
        .where(and(eq(schema.artifacts.workspaceId, ws.id), isNull(schema.artifacts.trashedAt)))
        .orderBy(desc(schema.artifacts.updatedAt));
    if (!rows.length) throw new Error("demo library is empty — run `pnpm seed`");
    const flds = await db
        .select({ id: schema.folders.id, name: schema.folders.name })
        .from(schema.folders)
        .where(eq(schema.folders.workspaceId, ws.id));

    const library: ChatLibrary = {
        view: "library",
        artifactCount: rows.length,
        recent: rows.slice(0, 6).map((r) => ({ title: r.title, format: fmtLabel(r.formatId) })),
        folders: flds,
    };
    const limit = limitsFor(ws.plan).aiCreditsPerMonth;
    const sample = (rows.find((r) => r.formatId === "deck") ?? rows[0]!)
        .draftContent as ArtifactContent;
    return {
        workspace: makeWorkspaceReader(ws.id),
        library,
        sample,
        plan: ws.plan,
        credits: { remaining: Math.max(0, limit - ws.aiCreditsUsed), limit },
        artifactId: (sub) =>
            rows.find((r) => r.title.toLowerCase().includes(sub.toLowerCase()))?.id,
        folderId: (name) => flds.find((f) => f.name.toLowerCase() === name.toLowerCase())?.id,
    };
}

// ---- one turn: run runChat, capture tools + full blocks + reply text ----
interface Turn {
    tools: string[];
    blocks: ChatBlock[];
    reply: string;
    ms: number;
    error?: string;
}

async function runTurn(
    model: string,
    message: string,
    context: ChatContext,
    history: ChatTurnRef[],
    env: Env,
): Promise<Turn> {
    const input: ChatInput = { message, context, history };
    const tools: string[] = [];
    const blocks: ChatBlock[] = [];
    let reply = "";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 150_000);
    const t0 = Date.now();
    try {
        for await (const ev of runChat(input, {
            workspace: env.workspace,
            model,
            signal: ctrl.signal,
        })) {
            if (ev.type === "chat.tool") tools.push(ev.tool);
            else if (ev.type === "chat.block") blocks.push(ev.block);
            else if (ev.type === "chat.text") reply += ev.delta;
        }
    } catch (e) {
        clearTimeout(timer);
        return {
            tools,
            blocks,
            reply,
            ms: Date.now() - t0,
            error: e instanceof Error ? e.message : String(e),
        };
    }
    clearTimeout(timer);
    return { tools, blocks, reply, ms: Date.now() - t0 };
}

// ---- scoring: routing + arguments ----
const first = <T extends ChatBlock["type"]>(
    blocks: ChatBlock[],
    type: T,
): Extract<ChatBlock, { type: T }> | undefined =>
    blocks.find((b): b is Extract<ChatBlock, { type: T }> => b.type === type);

function score(step: Step, tools: string[], blocks: ChatBlock[], env: Env): string[] {
    const reasons: string[] = [];
    const T = new Set(tools);
    const types = new Set<string>(blocks.map((b) => b.type));
    if (step.conversational) {
        if (tools.length) reasons.push(`should be tool-free, called: ${tools.join(", ")}`);
        if (blocks.length) reasons.push(`should be block-free, emitted: ${[...types].join(", ")}`);
    }
    for (const t of step.expectTools ?? []) if (!T.has(t)) reasons.push(`missing tool ${t}`);
    for (const t of step.forbidTools ?? []) if (T.has(t)) reasons.push(`forbidden tool ${t}`);
    for (const b of step.expectBlocks ?? []) if (!types.has(b)) reasons.push(`missing block ${b}`);
    for (const b of step.forbidBlocks ?? []) if (types.has(b)) reasons.push(`forbidden block ${b}`);

    const a = step.expectArgs;
    if (a) {
        if (a.targetArtifact) {
            const p = first(blocks, "proposal");
            const want = env.artifactId(a.targetArtifact);
            if (!p) reasons.push(`no proposal to check target`);
            else if (p.targetArtifactId !== want)
                reasons.push(`wrong target artifact (want "${a.targetArtifact}")`);
        }
        if (
            a.actionKind ||
            a.actionArtifact ||
            a.actionFolder ||
            a.actionTitleContains ||
            a.actionName
        ) {
            const act = first(blocks, "action")?.action;
            if (!act) reasons.push(`no action block`);
            else {
                if (a.actionKind && act.kind !== a.actionKind)
                    reasons.push(`wrong action (${act.kind} ≠ ${a.actionKind})`);
                if (a.actionArtifact && "id" in act) {
                    if (act.id !== env.artifactId(a.actionArtifact))
                        reasons.push(`action on wrong artifact (want "${a.actionArtifact}")`);
                }
                if (a.actionFolder && act.kind === "move") {
                    if (act.folderId !== env.folderId(a.actionFolder))
                        reasons.push(`wrong folder (want "${a.actionFolder}")`);
                }
                if (a.actionTitleContains && act.kind === "rename") {
                    if (!act.title.toLowerCase().includes(a.actionTitleContains.toLowerCase()))
                        reasons.push(`wrong new title (want "${a.actionTitleContains}")`);
                }
                if (a.actionName && act.kind === "create-folder") {
                    if (!act.name.toLowerCase().includes(a.actionName.toLowerCase()))
                        reasons.push(`wrong folder name (want "${a.actionName}")`);
                }
            }
        }
        if (a.briefSurface || a.briefSource) {
            const b = first(blocks, "brief")?.brief;
            if (!b) reasons.push(`no brief block`);
            else {
                if (a.briefSurface && b.surface !== a.briefSurface)
                    reasons.push(`wrong surface (${b.surface} ≠ ${a.briefSurface})`);
                if (a.briefSource && b.sourceArtifactId !== env.artifactId(a.briefSource))
                    reasons.push(`wrong/absent source artifact (want "${a.briefSource}")`);
            }
        }
    }
    return reasons;
}

// ---- LLM judge (only under --judge): score reply / proposed section / brief quality 1–5 ----
function sectionText(section: Section): string {
    const parts: string[] = [];
    const visit = (el?: ElementInstance): void => {
        if (!el) return;
        const d = el.data as { text?: string; children?: ElementInstance[] };
        if (typeof d.text === "string" && d.text.trim()) parts.push(d.text.trim());
        for (const k of d.children ?? []) visit(k);
    };
    visit(section.root);
    return parts.join("\n");
}

const JUDGE_SCHEMA = z.object({ score: z.number().min(1).max(5), reason: z.string() });

async function runJudge(step: Step, turn: Turn): Promise<{ score: number; reason: string }> {
    const j = step.judge!;
    let output = "";
    if (j.what === "reply") output = turn.reply.trim();
    else if (j.what === "brief") output = first(turn.blocks, "brief")?.brief.prompt ?? "";
    else {
        const p = first(turn.blocks, "proposal");
        output = p?.preview ? sectionText(p.preview) : "";
    }
    if (!output.trim()) return { score: 1, reason: "no output to judge" };
    return judge(JUDGE_MODEL, {
        schema: JUDGE_SCHEMA,
        system: "You are a strict evaluator. Score the OUTPUT from 1–5 on how well it satisfies the RUBRIC for the user's REQUEST (5 = excellent, 1 = fails). Judge only what's asked; be terse in `reason`.",
        prompt: `REQUEST: ${step.message}\n\nRUBRIC: ${j.rubric}\n\nOUTPUT:\n${output.slice(0, 4000)}`,
    });
}

// ---- one case (single- or multi-turn): thread history, apply proposals between turns ----
interface StepResult {
    pass: boolean;
    reasons: string[];
    judge?: number;
}
interface CaseResult {
    errored: boolean;
    error?: string;
    pass: boolean;
    steps: StepResult[];
    ms: number;
}

const stepsOf = (c: EvalCase): Step[] =>
    c.turns?.length ? c.turns : [{ message: c.message ?? "", ...c }];

async function runCase(model: string, c: EvalCase, env: Env): Promise<CaseResult> {
    const steps = stepsOf(c);
    let content: ArtifactContent | undefined =
        c.surface === "editor" ? clone(env.sample) : undefined;
    const history: ChatTurnRef[] = [];
    const results: StepResult[] = [];
    let ms = 0;
    for (const step of steps) {
        const context: ChatContext =
            c.surface === "editor"
                ? { surface: "editor", content: content!, plan: env.plan, credits: env.credits }
                : {
                      surface: "library",
                      library: env.library,
                      plan: env.plan,
                      credits: env.credits,
                  };
        const turn = await runTurn(model, step.message, context, history, env);
        ms += turn.ms;
        if (turn.error)
            return { errored: true, error: turn.error, pass: false, steps: results, ms };
        if (content)
            for (const b of turn.blocks)
                if (b.type === "proposal") content = applyPatch(content, b.patch);
        history.push({ role: "user", text: step.message });
        if (turn.reply.trim()) history.push({ role: "assistant", text: turn.reply.trim() });

        const reasons = score(step, turn.tools, turn.blocks, env);
        let judged: number | undefined;
        if (JUDGE && step.judge) {
            try {
                const v = await runJudge(step, turn);
                judged = v.score;
                if (v.score < (step.judge.min ?? 3))
                    reasons.push(`judge ${v.score}/5: ${v.reason}`);
            } catch {
                /* judge failure ≠ routing failure */
            }
        }
        results.push({ pass: reasons.length === 0, reasons, judge: judged });
    }
    return { errored: false, pass: results.every((r) => r.pass), steps: results, ms };
}

interface Cell {
    pass: number;
    ran: number;
    errors: number;
    ms: number[];
    judges: number[];
    fails: string[];
}

export async function runAgentEval(): Promise<void> {
    const env = await loadEnv();
    const cases = EVAL_CASES.filter(
        (c) => !FILTER || c.id.includes(FILTER) || c.category.includes(FILTER),
    );
    const tasks = MODELS.flatMap((model) =>
        cases.flatMap((c) => Array.from({ length: RUNS }, () => ({ model, c }))),
    );
    log(
        `Agent eval: ${cases.length} cases × ${RUNS} runs × ${MODELS.length} models = ${tasks.length} conversations` +
            ` (concurrency ${CONCURRENCY}${JUDGE ? `, judge ${shortModel(JUDGE_MODEL)}` : ""})`,
    );
    let done = 0;
    const results = await pool(tasks, CONCURRENCY, async (t) => {
        const res = await runCase(t.model, t.c, env);
        done++;
        if (done % 10 === 0 || done === tasks.length) log(`  … ${done}/${tasks.length}`);
        return { ...t, res };
    });

    const cellOf = new Map<string, Cell>();
    const modelOf = new Map<string, Cell>();
    const blank = (): Cell => ({ pass: 0, ran: 0, errors: 0, ms: [], judges: [], fails: [] });
    for (const model of MODELS) modelOf.set(model, blank());
    for (const r of results) {
        const cell = cellOf.get(`${r.model}|${r.c.id}`) ?? blank();
        const mm = modelOf.get(r.model)!;
        if (r.res.errored) {
            cell.errors++;
            mm.errors++;
            cell.fails.push(`error: ${r.res.error}`);
        } else {
            cell.ran++;
            mm.ran++;
            cell.ms.push(r.res.ms);
            mm.ms.push(r.res.ms);
            if (r.res.pass) {
                cell.pass++;
                mm.pass++;
            } else {
                cell.fails.push(r.res.steps.flatMap((s) => s.reasons).join("; "));
            }
            for (const s of r.res.steps)
                if (s.judge !== undefined) {
                    cell.judges.push(s.judge);
                    mm.judges.push(s.judge);
                }
        }
        cellOf.set(`${r.model}|${r.c.id}`, cell);
    }

    const { w, flush } = reporter();
    const jHead = JUDGE ? " avg judge |" : "";
    w(`# Agent-quality eval — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    w(
        `\n${cases.length} cases · ${RUNS} runs each · models: ${MODELS.map(shortModel).join(" vs ")}${JUDGE ? " · quality-judged" : ""}\n`,
    );
    w("## Overall");
    w(`| model | pass rate | errors | avg latency |${jHead}`);
    w(`|---|---|---|---|${JUDGE ? "---|" : ""}`);
    for (const model of MODELS) {
        const mm = modelOf.get(model)!;
        const jCell = JUDGE ? ` ${mm.judges.length ? avg(mm.judges).toFixed(1) : "–"}/5 |` : "";
        w(
            `| ${shortModel(model)} | **${pct(mm.pass, mm.ran)}** (${mm.pass}/${mm.ran}) | ${mm.errors} | ${(avg(mm.ms) / 1000).toFixed(1)}s |${jCell}`,
        );
    }
    w("\n## Per case");
    w(`| case | category | ${MODELS.map(shortModel).join(" | ")} |`);
    w(`|---|---|${MODELS.map(() => "---").join("|")}|`);
    for (const c of cases) {
        const cells = MODELS.map((model) => {
            const cell = cellOf.get(`${model}|${c.id}`)!;
            const flag =
                cell.ran === 0
                    ? "🛑"
                    : cell.pass === cell.ran
                      ? "✅"
                      : cell.pass === 0
                        ? "❌"
                        : "⚠️";
            const jc = JUDGE && cell.judges.length ? ` · J${avg(cell.judges).toFixed(1)}` : "";
            const e = cell.errors ? ` · ${cell.errors}e` : "";
            return `${flag} ${cell.pass}/${cell.ran} · ${(avg(cell.ms) / 1000).toFixed(1)}s${jc}${e}`;
        });
        w(`| ${c.id} | ${c.category} | ${cells.join(" | ")} |`);
    }
    w("\n## Failures");
    let any = false;
    for (const model of MODELS)
        for (const c of cases) {
            const cell = cellOf.get(`${model}|${c.id}`)!;
            if (cell.pass < cell.ran || cell.errors) {
                any = true;
                const uniq = [...new Set(cell.fails)].filter(Boolean);
                w(
                    `- **${shortModel(model)} / ${c.id}** (${cell.pass}/${cell.ran}${cell.errors ? `, ${cell.errors} errored` : ""}): ${uniq.join(" — ")}`,
                );
            }
        }
    if (!any) w("- none 🎉");
    flush(OUT);
}
