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
    return Object.values(s.cells).reduce((n, c) => n + (c.element ? countEls(c.element) : 0), 0);
}

// Strip an element to exactly what the AI emits — { type, data } with children cleaned the same way — so the
// exemplar is valid target JSON, not studio-only noise (drops `layout` and any other extra fields).
function cleanElement(el: ElementInstance): { type: string; data: Record<string, unknown> } {
    const data: Record<string, unknown> = { ...(el.data as Record<string, unknown>) };
    if (Array.isArray(data.children)) {
        data.children = (data.children as ElementInstance[]).map(cleanElement);
    }
    return { type: el.type, data };
}
function cleanSection(s: Section): unknown {
    const cells: Record<string, unknown> = {};
    for (const [key, cell] of Object.entries(s.cells)) {
        if (cell.element) cells[key] = { element: cleanElement(cell.element) };
    }
    return { id: s.id, grid: s.grid, cells };
}

// Two rich, grid-varied gold sections for the surface, as compact JSON. Capped by element count so the
// prompt stays lean, and picked for grid variety so the model sees more than one layout shape.
export function sectionExemplars(surface: Surface): string {
    const art = GOLD[surface] ?? GOLD.deck;
    const ranked = art.sections
        .map((s) => ({ s, n: sectionSize(s) }))
        .filter((x) => x.n >= 3 && x.n <= 12)
        .sort((a, b) => b.n - a.n);
    const first = ranked[0]?.s;
    const second = (ranked.find((x) => x.s.grid !== first?.grid) ?? ranked[1])?.s;
    const picks = [first, second].filter((s): s is Section => !!s);
    if (!picks.length) return "";
    const body = picks
        .map((s, i) => `Example ${i + 1} — grid "${s.grid}":\n${JSON.stringify(cleanSection(s))}`)
        .join("\n\n");
    return heading(
        `Gold-standard ${surface} sections — match this richness and density`,
        `These are real sections from hand-crafted, published artifacts. Notice how each fills its frame with a clear headline plus purposeful, varied elements (stats, cards, groups, bullets, images) — never a lone line of text on an empty frame:\n\n${body}`,
    );
}
