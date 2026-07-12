import "dotenv/config";
import { writeFileSync } from "fs";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { ChatContext, ChatInput, ChatLibrary } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import { limitsFor } from "@model/billing";
import { db, schema } from "../../schema";
import { makeWorkspaceReader } from "../../api/workspace-reader";
import { runChat } from "../chat";
import { EVAL_CASES, type EvalCase } from "./cases";

// The agent-quality eval harness — runs every case in cases.ts through the REAL runChat agent (real tools,
// real DB) against one or more models, N times each, and scores tool routing objectively (expected tools +
// blocks present, forbidden ones absent, restraint cases tool-free). Reports per-model pass rate, latency,
// and per-case variance so a model switch is a measured decision, not a vibe.
//
//   pnpm ai:eval                      # defaults: 3 runs, 2.5-pro vs 3.5-flash, all cases
//   pnpm ai:eval --runs=3 --models=google:gemini-2.5-pro,google:gemini-3.5-flash --filter=edit --out=report.md
//
// Requires the demo library to be seeded (find-artifacts resolves against it).

const DEMO_EMAIL = "demo@galleo.app";

const log = (s = ""): void => {
    process.stdout.write(`${s}\n`);
};

// ---- CLI args ----
function arg(name: string, fallback: string): string {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
}
const RUNS = Math.max(1, parseInt(arg("runs", "3"), 10));
const MODELS = arg("models", "google:gemini-2.5-pro,google:gemini-3.5-flash")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const FILTER = arg("filter", "");
const CONCURRENCY = Math.max(1, parseInt(arg("concurrency", "4"), 10));
const OUT = arg("out", "");
const shortModel = (id: string): string => id.split(":").pop() ?? id;

const fmtLabel = (id: string): string => (id === "web" ? "Site" : id === "doc" ? "Doc" : "Deck");

// ---- environment: the demo workspace, its library summary, and a sample open artifact ----
interface Env {
    workspace: ReturnType<typeof makeWorkspaceReader>;
    library: ChatLibrary;
    sample: ArtifactContent;
    plan: string;
    credits: { remaining: number; limit: number };
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
    };
}

// ---- run + score one case ----
interface RunResult {
    pass: boolean;
    reasons: string[];
    ms: number;
    tools: string[];
    blocks: string[];
    error?: string;
}

function score(c: EvalCase, tools: string[], blocks: string[]): string[] {
    const reasons: string[] = [];
    const T = new Set(tools);
    const B = new Set(blocks);
    if (c.conversational) {
        if (tools.length) reasons.push(`should be tool-free, called: ${tools.join(", ")}`);
        if (blocks.length) reasons.push(`should be block-free, emitted: ${blocks.join(", ")}`);
    }
    for (const t of c.expectTools ?? []) if (!T.has(t)) reasons.push(`missing tool ${t}`);
    for (const t of c.forbidTools ?? []) if (T.has(t)) reasons.push(`forbidden tool ${t}`);
    for (const b of c.expectBlocks ?? []) if (!B.has(b)) reasons.push(`missing block ${b}`);
    for (const b of c.forbidBlocks ?? []) if (B.has(b)) reasons.push(`forbidden block ${b}`);
    return reasons;
}

async function runOne(model: string, c: EvalCase, env: Env): Promise<RunResult> {
    const context: ChatContext =
        c.surface === "editor"
            ? { surface: "editor", content: env.sample, plan: env.plan, credits: env.credits }
            : { surface: "library", library: env.library, plan: env.plan, credits: env.credits };
    const input: ChatInput = { message: c.message, context };
    const tools: string[] = [];
    const blocks: string[] = [];
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
            else if (ev.type === "chat.block") blocks.push(ev.block.type);
        }
    } catch (e) {
        clearTimeout(timer);
        return {
            pass: false,
            reasons: [`error: ${e instanceof Error ? e.message : String(e)}`],
            ms: Date.now() - t0,
            tools,
            blocks,
            error: e instanceof Error ? e.message : String(e),
        };
    }
    clearTimeout(timer);
    const reasons = score(c, tools, blocks);
    return { pass: reasons.length === 0, reasons, ms: Date.now() - t0, tools, blocks };
}

// bounded-concurrency pool
async function pool<I, O>(items: I[], size: number, fn: (item: I) => Promise<O>): Promise<O[]> {
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

// ---- main ----
interface Task {
    model: string;
    c: EvalCase;
    run: number;
}

async function main(): Promise<void> {
    const env = await loadEnv();
    const cases = EVAL_CASES.filter(
        (c) => !FILTER || c.id.includes(FILTER) || c.category.includes(FILTER),
    );
    const tasks: Task[] = [];
    for (const model of MODELS)
        for (const c of cases) for (let r = 0; r < RUNS; r++) tasks.push({ model, c, run: r });

    log(
        `Eval: ${cases.length} cases × ${RUNS} runs × ${MODELS.length} models = ${tasks.length} turns (concurrency ${CONCURRENCY})`,
    );
    let done = 0;
    const results = await pool(tasks, CONCURRENCY, async (t) => {
        const res = await runOne(t.model, t.c, env);
        done++;
        if (done % 10 === 0 || done === tasks.length) log(`  … ${done}/${tasks.length}`);
        return { ...t, res };
    });

    // ---- aggregate ----
    interface CellAgg {
        pass: number;
        total: number;
        ms: number[];
        fails: string[];
    }
    const byModelCase = new Map<string, CellAgg>(); // key `${model}|${caseId}`
    const byModel = new Map<string, { pass: number; total: number; ms: number[] }>();
    for (const model of MODELS) byModel.set(model, { pass: 0, total: 0, ms: [] });
    for (const r of results) {
        const key = `${r.model}|${r.c.id}`;
        const cell = byModelCase.get(key) ?? { pass: 0, total: 0, ms: [], fails: [] };
        cell.total++;
        cell.ms.push(r.res.ms);
        if (r.res.pass) cell.pass++;
        else cell.fails.push(r.res.reasons.join("; "));
        byModelCase.set(key, cell);
        const mm = byModel.get(r.model)!;
        mm.total++;
        mm.ms.push(r.res.ms);
        if (r.res.pass) mm.pass++;
    }
    const avg = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
    const pct = (p: number, t: number): string => `${t ? Math.round((p / t) * 100) : 0}%`;

    // ---- report ----
    const lines: string[] = [];
    const w = (s = ""): void => {
        lines.push(s);
        log(s);
    };
    w(`# Agent-quality eval — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    w(
        `\n${cases.length} cases · ${RUNS} runs each · models: ${MODELS.map(shortModel).join(" vs ")}\n`,
    );
    w("## Overall");
    w("| model | pass rate | avg latency |");
    w("|---|---|---|");
    for (const model of MODELS) {
        const mm = byModel.get(model)!;
        w(
            `| ${shortModel(model)} | **${pct(mm.pass, mm.total)}** (${mm.pass}/${mm.total}) | ${(avg(mm.ms) / 1000).toFixed(1)}s |`,
        );
    }
    w("\n## Per case");
    w(`| case | category | ${MODELS.map(shortModel).join(" | ")} |`);
    w(`|---|---|${MODELS.map(() => "---").join("|")}|`);
    for (const c of cases) {
        const cells = MODELS.map((model) => {
            const cell = byModelCase.get(`${model}|${c.id}`)!;
            const flag = cell.pass === cell.total ? "✅" : cell.pass === 0 ? "❌" : "⚠️";
            return `${flag} ${cell.pass}/${cell.total} · ${(avg(cell.ms) / 1000).toFixed(1)}s`;
        });
        w(`| ${c.id} | ${c.category} | ${cells.join(" | ")} |`);
    }
    // failures detail
    w("\n## Failures");
    let any = false;
    for (const model of MODELS)
        for (const c of cases) {
            const cell = byModelCase.get(`${model}|${c.id}`)!;
            if (cell.pass < cell.total) {
                any = true;
                const uniq = [...new Set(cell.fails)];
                w(
                    `- **${shortModel(model)} / ${c.id}** (${cell.pass}/${cell.total}): ${uniq.join(" — ")}`,
                );
            }
        }
    if (!any) w("- none 🎉");

    if (OUT) {
        writeFileSync(OUT, lines.join("\n"));
        log(`\nreport → ${OUT}`);
    }
    process.exit(0);
}

main().catch((e) => {
    log(`FATAL: ${e instanceof Error ? e.stack : String(e)}`);
    process.exit(1);
});
