import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import type { EvalCheck } from "@model/eval";
import { sectionsForLength } from "@model/tools";
import { PLACEHOLDER, contentOf } from "../quality";

// Deterministic quality checks: free to run and they never drift, so everything that can be decided
// without a model is decided here and the judge's budget goes to taste. Layout-derived checks
// (overflow, stacking) need the engine and so live in evaltools/, not here — services cannot import
// canvas.

export type Dimension = "content" | "structure" | "variety";

export interface Check {
    id: string;
    dimension: Dimension;
    describe: string;
    /** null passes; a string is the reason it failed, shown as-is. */
    section?(section: Section, ctx: CheckCtx): string | null;
    artifact?(content: ArtifactContent, ctx: CheckCtx): string | null;
}

export interface CheckCtx {
    surface: string;
    length?: string;
}

export type CheckResult = EvalCheck;

const words = (texts: string[]): number =>
    texts.join(" ").trim().split(/\s+/).filter(Boolean).length;

// a stat a model invented reads round; a real one rarely does
const ROUND = /\b\d+(?:0{2,})\b|\b(?:10|20|25|30|40|50|60|70|75|80|90|95|99)%/;

const topTypes = (section: Section): string[] => {
    const kids = (section.root.data as { children?: ElementInstance[] }).children;
    return Array.isArray(kids) ? kids.map((k) => k.type) : [section.root.type];
};

export const CHECKS: Check[] = [
    {
        id: "placeholder-copy",
        dimension: "content",
        describe: "no lorem, TBD, or 'your text here'",
        section: (s) =>
            contentOf(s).texts.some((t) => PLACEHOLDER.test(t))
                ? "contains placeholder or lorem text"
                : null,
    },
    {
        id: "body-copy-length",
        dimension: "content",
        describe: "a slide is not a document: body copy stays under 60 words",
        section: (s, ctx) => {
            if (ctx.surface !== "deck") return null;
            const n = words(contentOf(s).texts);
            return n > 60 ? `${n} words on one slide` : null;
        },
    },
    {
        id: "has-content",
        dimension: "content",
        describe: "the section says something",
        section: (s) => (words(contentOf(s).texts) < 3 ? "almost no copy" : null),
    },
    {
        id: "invented-stat",
        dimension: "content",
        describe: "numbers are not suspiciously round",
        section: (s) => {
            const hit = contentOf(s).texts.find((t) => ROUND.test(t));
            return hit ? `round-looking figure: ${hit.slice(0, 60)}` : null;
        },
    },
    {
        id: "single-element-type",
        dimension: "variety",
        describe: "a section is more than a stack of one thing",
        section: (s) => {
            const types = topTypes(s);
            return types.length > 2 && new Set(types).size === 1
                ? `${types.length} children, all ${types[0]}`
                : null;
        },
    },
    {
        id: "duplicate-labels",
        dimension: "structure",
        describe: "no two sections share a title",
        artifact: (c) => {
            const seen = new Map<string, number>();
            for (const s of c.sections) {
                const t = (contentOf(s).texts[0] ?? "").trim().toLowerCase();
                if (t) seen.set(t, (seen.get(t) ?? 0) + 1);
            }
            const dupe = [...seen.entries()].find(([, n]) => n > 1);
            return dupe ? `"${dupe[0].slice(0, 40)}" appears ${dupe[1]} times` : null;
        },
    },
    {
        id: "layout-repetition",
        dimension: "variety",
        describe: "no three sections in a row share a shape",
        artifact: (c) => {
            const sigs = c.sections.map((s) => topTypes(s).join(","));
            for (let i = 2; i < sigs.length; i++)
                if (sigs[i] && sigs[i] === sigs[i - 1] && sigs[i] === sigs[i - 2])
                    return `sections ${i - 1}–${i + 1} share a shape`;
            return null;
        },
    },
    {
        id: "section-count",
        dimension: "structure",
        describe: "the piece is the length that was asked for",
        artifact: (c, ctx) => {
            const want = sectionsForLength(ctx.length);
            const got = c.sections.length;
            // the planner is allowed to breathe; only a big miss is a failure
            return Math.abs(got - want) > Math.ceil(want / 3)
                ? `${got} sections for a ${ctx.length ?? "Standard"} brief (expected ~${want})`
                : null;
        },
    },
    {
        id: "empty-sections",
        dimension: "structure",
        describe: "no section landed empty",
        artifact: (c) => {
            const empty = c.sections.filter((s) => words(contentOf(s).texts) === 0).length;
            return empty ? `${empty} section(s) with no copy` : null;
        },
    },
];

export function runChecks(content: ArtifactContent, ctx: CheckCtx): CheckResult[] {
    const out: CheckResult[] = [];
    for (const check of CHECKS) {
        if (check.artifact) {
            const detail = check.artifact(content, ctx);
            out.push({
                id: check.id,
                dimension: check.dimension,
                target: "artifact",
                pass: !detail,
                ...(detail ? { detail } : {}),
            });
        }
        if (check.section)
            for (const s of content.sections) {
                const detail = check.section(s, ctx);
                out.push({
                    id: check.id,
                    dimension: check.dimension,
                    target: `section:${s.id}`,
                    pass: !detail,
                    ...(detail ? { detail } : {}),
                });
            }
    }
    return out;
}

export const failures = (results: readonly CheckResult[]): CheckResult[] =>
    results.filter((r) => !r.pass);

/** Share of checks passed, the one number a run list can sort on. */
export const passRate = (results: readonly CheckResult[]): number =>
    results.length ? results.filter((r) => r.pass).length / results.length : 1;
