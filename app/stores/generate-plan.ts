import type { Beat } from "@model/ai";
import type { UnitPrices } from "@model/credits";
import { creditsForUsd, DEFAULT_UNIT_PRICES, usdOfUsage } from "@model/credits";
import { LAYOUT_PRESETS } from "@model/artifact";
import { estimateCost } from "@model/tools";

export const LAYOUT_IDS: string[] = Object.keys(LAYOUT_PRESETS);

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

export const planCost = (prices?: UnitPrices): number => estimateCost("plan-outline", {}, prices);
export const sectionCost = (prices?: UnitPrices): number => estimateCost("write-beat", {}, prices);

/**
 * What writing the remaining beats costs. Priced over the whole build and rounded once, not summed
 * from per-section estimates: a section costs well under a credit, so rounding each one first would
 * quote several times the real charge.
 */
export function buildCost(
    beats: Beat[],
    imageSource?: "stock" | "ai",
    prices: UnitPrices = DEFAULT_UNIT_PRICES,
): number {
    const images = imageSource === "ai" ? beats.filter((b) => b.image).length : 0;
    if (!beats.length && !images) return 0;
    return creditsForUsd(usdOfUsage({ section: beats.length, image: images }, prices));
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
