import "dotenv/config";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { format, resolveConfig } from "prettier";
import { desc } from "drizzle-orm";
import type { ModelSpan, PromptPart } from "@model/ai";
import { creditsForUsd } from "@model/credits";
import { assertDatabaseUrl, db } from "../services/db/client";
import { schema } from "../services/db/schema";
import { usdOf } from "../services/core/ai/meter";
import { RUBRIC } from "../services/core/ai/eval/rubric";
import type { SeedEvalRun, SeedSpan } from "../services/db/seed-evals";
import { CLIP, clip, isJudgeSpan, promptFingerprint } from "./eval-fixture-spec";

const w = (s: string): boolean => process.stdout.write(`${s}\n`);
const arg = (name: string, fallback: string): string => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const OUT = arg("out", "services/db/seed-eval-data.ts");

// a run as it comes back from the table, before it is folded into a fixture
type Row = typeof schema.evalRuns.$inferSelect;
const IDS = arg("ids", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const LIMIT = Number(arg("limit", "7"));
const ERROR_FROM = arg("error-from", ""); // "<idPrefix>@<spanCount>"
const DRY = flag("dry");

const MAX_SPANS = 40;
const MAX_MODULE_BYTES = 700_000;

const key = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 12);

interface Tables {
    texts: Record<string, string>;
    parts: Record<string, PromptPart[]>;
}

function packSpans(spans: ModelSpan[], t: Tables): SeedSpan[] {
    return spans.slice(0, MAX_SPANS).map((s) => {
        const partsRef = s.parts?.length ? key(JSON.stringify(s.parts)) : undefined;
        if (partsRef && s.parts) t.parts[partsRef] = s.parts;
        // a span with parts needs no system: stack() joins the fragments with a blank line
        const systemRef = !partsRef && s.system ? key(s.system) : undefined;
        if (systemRef && s.system) t.texts[systemRef] = s.system;
        return {
            modelId: s.modelId,
            input: s.input,
            output: s.output,
            step: s.step,
            ms: s.ms,
            ...(systemRef ? { systemRef } : {}),
            ...(partsRef ? { partsRef } : {}),
            ...(s.prompt ? { prompt: clip(s.prompt) } : {}),
            ...(s.response ? { response: clip(s.response) } : {}),
            ...(s.temperature === undefined ? {} : { temperature: s.temperature }),
            ...(s.finishReason ? { finishReason: s.finishReason } : {}),
        };
    });
}

// Stable across captures, so a refreshed fixture keeps the same identity in the seed: derived from
// what the run was asked to make, not from its database id.
const fixtureId = (r: Row): string => {
    const slug = (r.config.meta.prompt || "untitled")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .split("-")
        .slice(0, 4)
        .join("-");
    return `${r.config.meta.surface ?? "deck"}-${slug}`;
};

// Why this run is in the set — the selection reason, so the next person reading the fixture knows
// which case it is holding down and does not drop it by accident.
const roleOf = (r: Row): string => {
    if (r.spans.some((s) => s.parts?.length)) return "carries prompt fragments";
    if (!r.judgements?.length) return "unjudged, for the judge-on-demand path";
    if (stepCounts(r).some((n) => n > 1)) return "has a retry, so attempts render";
    if (r.checks?.some((c) => !c.pass)) return "has failing checks";
    return `${r.config.meta.surface ?? "deck"} coverage`;
};

/**
 * A run that failed partway. No real generation in the capture set errored, and the playground
 * needs the case, so one is derived from a real run: its outline lands, the first section is
 * written, then it stops. Truncating a real run beats inventing spans that never happened.
 */
function deriveErrorRun(runs: SeedEvalRun[], t: Tables): SeedEvalRun {
    const base = runs.find((r) => r.spans.length > 2) ?? runs[0];
    if (!base) throw new Error("no run to derive an error run from");
    void t; // the spans are reused as-is, so nothing new is interned
    const kept = base.spans.slice(0, 2);
    return {
        ...base,
        id: `${base.id}-failed`,
        role: "stopped partway, for the error state",
        minutesAgo: base.minutesAgo + 40,
        spans: kept,
        // the artifact never finished, so only what landed before the failure is kept
        content: base.content
            ? { ...base.content, sections: base.content.sections.slice(0, 1) }
            : base.content,
        judgements: [],
        status: "error",
        error: "the model returned no usable JSON for section 2",
    };
}

// calls per step; a step with more than one is a retry, which the inspector renders as attempts
const stepCounts = (r: Row): number[] => {
    const n = new Map<string, number>();
    for (const s of r.spans) n.set(s.step, (n.get(s.step) ?? 0) + 1);
    return [...n.values()];
};

// Selection: parts first, then surface coverage, then the awkward cases the inspector needs.
function select(rows: Row[]): Row[] {
    if (IDS.length) return IDS.flatMap((p) => rows.filter((r) => r.id.startsWith(p)));
    const picked: Row[] = [];
    const take = (r: Row | undefined): void => {
        if (r && !picked.some((p) => p.id === r.id)) picked.push(r);
    };
    take(rows.find((r) => r.spans.some((s) => s.parts?.length)));
    for (const surface of ["deck", "doc", "web"])
        take(rows.find((r) => r.config.meta.surface === surface));
    take(rows.find((r) => !r.judgements?.length));
    take(rows.find((r) => stepCounts(r).some((n) => n > 1)));
    take(rows.find((r) => r.checks?.some((c) => !c.pass)));
    for (const r of rows) if (picked.length < LIMIT) take(r);
    return picked.slice(0, LIMIT).sort((a, b) => a.spans.length - b.spans.length);
}

async function main(): Promise<void> {
    assertDatabaseUrl();
    const raw = await db
        .select()
        .from(schema.evalRuns)
        .orderBy(desc(schema.evalRuns.createdAt))
        .limit(50);

    let dropped = 0;
    const rows = raw.map((r) => {
        const gen = r.spans.filter((s) => {
            if (!isJudgeSpan(s)) return true;
            dropped++;
            return false;
        });
        return { ...r, spans: gen };
    });
    if (dropped) w(`dropped ${dropped} judge spans (gen-eval runs judgeRun inside withMeter)`);

    const chosen = select(rows);
    const t: Tables = { texts: {}, parts: {} };
    const runs = chosen.map((r, i) => {
        const spans = packSpans(r.spans, t);
        if (!r.spans.some((s) => s.parts?.length))
            w(`  warning: ${r.id.slice(0, 8)} has no prompt parts (captured before recordParts)`);
        return {
            id: fixtureId(r),
            role: roleOf(r),
            minutesAgo: 90 + i * 260,
            config: r.config,
            spans,
            content: r.content,
            judgements: r.judgements ?? [],
            status: r.status,
            error: r.error,
            credits: creditsForUsd(usdOf(r.spans)),
            ms: r.ms,
        };
    });
    if (ERROR_FROM) runs.push(deriveErrorRun(runs, t));

    const source = emit(runs, t);
    if (source.length > MAX_MODULE_BYTES)
        throw new Error(
            `fixture module is ${source.length} bytes, over the ${MAX_MODULE_BYTES} ceiling`,
        );
    const pretty = await format(source, {
        ...(await resolveConfig(OUT)),
        filepath: OUT,
    });
    w(
        `${runs.length} runs · ${runs.reduce((n, r) => n + r.spans.length, 0)} spans · ${(pretty.length / 1024).toFixed(0)} kB`,
    );
    if (DRY) return;
    writeFileSync(OUT, pretty);
    w(`→ ${OUT}`);
}

function emit(runs: unknown[], t: Tables): string {
    const j = (v: unknown): string => JSON.stringify(v, null, 4);
    return [
        `// Generated by \`pnpm eval:capture\`. Do not edit by hand.`,
        `// Captured ${new Date().toISOString()} · rubric ${RUBRIC.version} · clip ${CLIP}.`,
        ``,
        `import type { PromptPart } from "@model/ai";`,
        `import type { SeedEvalRun } from "./seed-evals";`,
        ``,
        `export const EVAL_CAPTURE = ${j({
            at: new Date().toISOString(),
            promptFingerprint: promptFingerprint(),
            rubricVersion: RUBRIC.version,
            clip: CLIP,
        })};`,
        ``,
        `export const EVAL_PROMPT_TEXTS: Record<string, string> = ${j(t.texts)};`,
        ``,
        `export const EVAL_PROMPT_PARTS: Record<string, PromptPart[]> = ${j(t.parts)};`,
        ``,
        `export const EVAL_RUNS: SeedEvalRun[] = ${j(runs)};`,
        ``,
    ].join("\n");
}

main()
    .then(() => process.exit(0))
    .catch((e: unknown) => {
        w(String(e));
        process.exit(1);
    });
