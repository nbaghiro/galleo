import type { Beat } from "@model/ai";
import { LAYOUT_PRESETS } from "@model/section";
import type { UnitRates } from "@model/credits";
import { COST_UNITS } from "@model/credits";
import { estimateCost } from "@model/tools";

export const LAYOUT_IDS: string[] = Object.keys(LAYOUT_PRESETS);

export const columnsFor = (layout?: string): number =>
    LAYOUT_PRESETS[layout ?? "full"]?.length ?? 1;

// keeps the blocks that still fit the new column count
export function blocksForLayout(layout: string, prev?: string[]): string[] {
    const n = columnsFor(layout);
    const kept = (prev ?? []).slice(0, n);
    while (kept.length < n) kept.push("text");
    return kept;
}

export function moveBeat(beats: Beat[], id: string, dir: -1 | 1): Beat[] {
    const i = beats.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= beats.length) return beats;
    const next = [...beats];
    const [b] = next.splice(i, 1);
    next.splice(j, 0, b!);
    return next;
}

export function reorderBeat(beats: Beat[], id: string, toIndex: number): Beat[] {
    const i = beats.findIndex((b) => b.id === id);
    if (i < 0) return beats;
    const clamped = Math.max(0, Math.min(beats.length - 1, toIndex));
    if (clamped === i) return beats;
    const next = [...beats];
    const [b] = next.splice(i, 1);
    next.splice(clamped, 0, b!);
    return next;
}

export function removeBeat(beats: Beat[], id: string): Beat[] {
    return beats.filter((b) => b.id !== id);
}

export function updateBeat(beats: Beat[], id: string, patch: Partial<Beat>): Beat[] {
    return beats.map((b) => (b.id === id ? { ...b, ...patch, id: b.id } : b));
}

// fresh non-colliding beat/section id in the outline's "s<N>" scheme
export function newBeatId(beats: Beat[]): string {
    const taken = new Set(beats.map((b) => b.id));
    for (let n = beats.length + 1; ; n++) {
        const id = `s${n}`;
        if (!taken.has(id)) return id;
    }
}

export function makeBeat(id: string): Beat {
    return {
        id,
        label: "New section",
        role: "detail",
        layout: "full",
        blocks: ["text"],
        image: false,
        brief: "",
    };
}

export function insertBeatAfter(beats: Beat[], afterId: string | null, beat: Beat): Beat[] {
    if (afterId === null) return [beat, ...beats];
    const i = beats.findIndex((b) => b.id === afterId);
    if (i < 0) return [...beats, beat];
    return [...beats.slice(0, i + 1), beat, ...beats.slice(i + 1)];
}

// must-cover → the beat ids whose `covers` claim it (verbatim, case-insensitive)
export function coverageMap(mustInclude: string[], beats: Beat[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const point of mustInclude) {
        const key = point.trim().toLowerCase();
        map.set(
            point,
            beats
                .filter((b) => (b.covers ?? []).some((c) => c.trim().toLowerCase() === key))
                .map((b) => b.id),
        );
    }
    return map;
}

export const briefCost = (rates?: UnitRates): number => estimateCost("draft-brief", {}, rates);
export const planCost = (rates?: UnitRates): number => estimateCost("plan-outline", {}, rates);
export const sectionCost = (rates?: UnitRates): number => estimateCost("add-section", {}, rates);

// AI images are priced per image-leading beat, and images run on their own model, so they don't scale
export function buildCost(beats: Beat[], imageSource?: "stock" | "ai", rates?: UnitRates): number {
    const images = imageSource === "ai" ? beats.filter((b) => b.image).length : 0;
    return beats.length * sectionCost(rates) + images * COST_UNITS.image;
}

// a choice question ("A or B?") must yield null, not invent a requirement the user never stated
const INCLUDE_QUESTION =
    /^(should|shall|does|do|would|will|can|could)\s+(it|this|that|we|you|the\s+\S+)?\s*(also\s+)?(include|cover|mention|have|show|address|feature)\s+/i;

export function pointFromQuestion(question: string): string | null {
    const asked = question
        .trim()
        .replace(/\?+\s*$/, "")
        .trim();
    if (!INCLUDE_QUESTION.test(asked)) return null;
    const point = asked.replace(INCLUDE_QUESTION, "").trim();
    return point && point.length <= 90 ? point : null;
}
