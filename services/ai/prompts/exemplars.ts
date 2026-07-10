import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import type { Surface } from "@model/ai";
import { galleo } from "../../demos/galleo";
import { helios } from "../../demos/helios";
import { terra } from "../../demos/terra";
import { heading } from "./system";

// Few-shot exemplars for section writing — the single biggest quality lever. The section prompt describes
// the element catalog but never *shows* a great section; here we lift real sections from the hand-built demo
// library (one gold artifact per surface) and serialize them to the exact JSON the model must emit. Seeing
// how a published section fills its frame with a headline + varied, purposeful elements is what pulls the
// output up from sparse walls-of-text. Placed in the section *system* prompt (identical across a run's
// sections), so a provider can cache the prefix and it costs little per section.

// One gold artifact per surface — the quality/density bar to match.
const GOLD: Record<Surface, ArtifactContent> = { deck: galleo, doc: helios, web: terra };

// Total element instances in a subtree — a cheap proxy for richness.
function countEls(el: ElementInstance): number {
    const kids = (el.data as { children?: ElementInstance[] } | undefined)?.children;
    return 1 + (Array.isArray(kids) ? kids.reduce((n, k) => n + countEls(k), 0) : 0);
}
function sectionSize(s: Section): number {
    return countEls(s.root);
}

// Strip an element to exactly what the AI emits — { type, data, layout? } with children cleaned the same
// way — so the exemplar is valid target JSON. `layout` (a child's column width) is KEPT: it's load-bearing
// in the recursive model, so exemplars must show the model how columns carry their widths.
function cleanElement(el: ElementInstance): Record<string, unknown> {
    const data: Record<string, unknown> = { ...(el.data as Record<string, unknown>) };
    if (Array.isArray(data.children)) {
        data.children = (data.children as ElementInstance[]).map(cleanElement);
    }
    return el.layout ? { type: el.type, data, layout: el.layout } : { type: el.type, data };
}
function cleanSection(s: Section): unknown {
    return { id: s.id, root: cleanElement(s.root) };
}

// The structural shape of a section's root — its top-level direction + column count — so exemplars can be
// picked for layout variety (a stacked section vs a split one).
function shapeOf(s: Section): string {
    const d = s.root.data as { direction?: string; children?: unknown[] };
    if (!Array.isArray(d.children)) return "leaf";
    return `${d.direction ?? "col"}:${d.children.length}`;
}

// Two rich, structurally-varied gold sections for the surface, as compact JSON. Capped by element count so
// the prompt stays lean, and picked for layout variety so the model sees more than one shape.
export function sectionExemplars(surface: Surface): string {
    const art = GOLD[surface] ?? GOLD.deck;
    const ranked = art.sections
        .map((s) => ({ s, n: sectionSize(s) }))
        .filter((x) => x.n >= 3 && x.n <= 12)
        .sort((a, b) => b.n - a.n);
    const first = ranked[0]?.s;
    const second = (ranked.find((x) => shapeOf(x.s) !== (first ? shapeOf(first) : "")) ?? ranked[1])
        ?.s;
    const picks = [first, second].filter((s): s is Section => !!s);
    if (!picks.length) return "";
    const body = picks
        .map(
            (s, i) =>
                `Example ${i + 1} — layout ${shapeOf(s)}:\n${JSON.stringify(cleanSection(s))}`,
        )
        .join("\n\n");
    return heading(
        `Gold-standard ${surface} sections — match this richness and density`,
        `These are real sections from hand-crafted, published artifacts. Notice how each fills its frame with a clear headline plus purposeful, varied elements (stats, cards, groups, bullets, images) — never a lone line of text on an empty frame:\n\n${body}`,
    );
}
