import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import type { CheckDimension, EvalCheck } from "@model/eval";
import { sectionForms } from "@model/artifact";
import { sectionsForLength } from "@model/tools";
import { templateBody } from "@services/core/templates";
import { PLACEHOLDER, contentOf, structureIssues } from "@services/core/ai/quality";

// Deterministic quality checks: free to run and they never drift, so everything that can be decided
// without a model is decided here and the judge's budget goes to taste. Layout-derived checks
// (overflow, stacking) need the engine and so live in evaltools/, not here — services cannot import
// canvas.

export interface Check {
    id: string;
    dimension: CheckDimension;
    describe: string;
    /** null passes; a string is the reason it failed, shown as-is. */
    section?(section: Section, ctx: CheckCtx): string | null;
    artifact?(content: ArtifactContent, ctx: CheckCtx): string | null;
}

interface CheckCtx {
    surface: string;
    length?: string;
    /** The starter this run borrowed its shapes from, when the reader picked one. */
    shapeTemplateId?: string;
}

type CheckResult = EvalCheck;

const words = (texts: string[]): number =>
    texts.join(" ").trim().split(/\s+/).filter(Boolean).length;

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
        // calibrated against the corpus, whose densest hand-built slide runs to 83 words: a
        // threshold the quality bar itself fails is measuring the threshold, not the work
        describe: "a slide is not a document: body copy stays under 90 words",
        section: (s, ctx) => {
            if (ctx.surface !== "deck") return null;
            const n = words(contentOf(s).texts);
            return n > 90 ? `${n} words on one slide` : null;
        },
    },
    {
        // The same rule the writer's own repair loop runs on, reported here so the corpus keeps it
        // honest: a structural bar the hand-built work fails is measuring itself, not the work.
        id: "renders-what-it-declares",
        dimension: "structure",
        describe: "every element is a catalog type carrying the content that type needs",
        section: (s) => structureIssues(s).join("; ") || null,
    },
    {
        id: "has-content",
        dimension: "content",
        describe: "the section says something",
        section: (s) => (words(contentOf(s).texts) < 3 ? "almost no copy" : null),
    },
    {
        id: "stacked-text",
        dimension: "variety",
        // text only: three stat cards or three images in a row is a deliberate pattern the corpus
        // uses often, while three stacked paragraphs is the wall this is meant to catch
        describe: "a section is more than a stack of paragraphs",
        section: (s) => {
            const types = topTypes(s);
            return types.length > 2 && types.every((t) => t === "text")
                ? `${types.length} stacked text blocks`
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
        // A shape lends a catalog, not a running order, so the question is whether a section is one
        // of the designs on offer rather than whether section i is design i.
        id: "keeps-the-borrowed-shape",
        dimension: "layout",
        describe: "a run that borrowed a shape builds every section from one of its designs",
        artifact: (c, ctx) => {
            if (!ctx.shapeTemplateId) return null;
            const body = templateBody(ctx.shapeTemplateId);
            if (!body) return null;
            const offered = new Set(
                sectionForms(body).map((f) => `${f.layout}|${f.blocks.join()}`),
            );
            const got = sectionForms(c);
            const off = got.filter((f) => !offered.has(`${f.layout}|${f.blocks.join()}`));
            return off.length
                ? `${off.length} of ${got.length} sections match no design in the library (${off
                      .slice(0, 4)
                      .map((f) => `${f.id}: ${f.layout} · ${f.blocks.join(" | ")}`)
                      .join("; ")})`
                : null;
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
    {
        id: "no-photo-twice",
        dimension: "variety",
        describe: "no image appears twice in one piece",
        // its own counting walk: mediaRefs returns DISTINCT urls, which can never show a repeat
        artifact: (c) => {
            const seen = new Map<string, number>();
            const note = (v: unknown): void => {
                if (typeof v === "string" && v.startsWith("http"))
                    seen.set(v, (seen.get(v) ?? 0) + 1);
            };
            const walk = (el: ElementInstance): void => {
                const d = el.data as {
                    src?: unknown;
                    poster?: unknown;
                    children?: ElementInstance[];
                };
                note(d.src);
                note(d.poster);
                for (const k of d.children ?? []) walk(k);
            };
            for (const sec of c.sections) {
                walk(sec.root);
                if (sec.background?.kind === "image") note(sec.background.image);
            }
            const dupe = [...seen.entries()].find(([, n]) => n > 1);
            return dupe ? `"${dupe[0].slice(0, 60)}" appears ${dupe[1]} times` : null;
        },
    },
    {
        // a profile or testimonial without a face renders the ghost avatar circle
        id: "every-person-has-a-face",
        dimension: "content",
        section: (s) => {
            let ghosts = 0;
            const walk = (el: ElementInstance): void => {
                const d = el.data as { children?: ElementInstance[]; src?: string };
                if (el.type === "profile" || el.type === "testimonial") {
                    const face = (d.children ?? []).some((k) => {
                        const kd = k.data as { src?: string; kind?: string };
                        const avatarish =
                            k.type === "avatar" || (k.type === "media" && kd.kind === "photo");
                        return avatarish && typeof kd.src === "string" && kd.src.trim() !== "";
                    });
                    if (!face) ghosts += 1;
                }
                for (const k of d.children ?? []) walk(k);
            };
            walk(s.root);
            return ghosts ? `${ghosts} person card(s) with no face, the ghost avatar` : null;
        },
        describe: "every profile/testimonial carries a face image",
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
