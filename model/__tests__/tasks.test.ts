import { describe, expect, it } from "vitest";
import { costOf } from "../credits";
import { estimateCost } from "../tools";
import { AI_TASKS, UNIT_TASK, unitMultipliers } from "../tasks";

const rate =
    (map: Record<string, number>) =>
    (id: string): number | undefined =>
        map[id];

describe("unitMultipliers", () => {
    it("prices each unit by the model behind its task", () => {
        const rates = unitMultipliers(
            (t) => ({ outline: "big", section: "small" })[t as string],
            rate({ big: 3, small: 0.5 }),
        );
        expect(rates).toEqual({ plan: 3, section: 0.5 });
    });

    it("omits a unit priced at the baseline, so an untouched run carries no rates at all", () => {
        expect(unitMultipliers(() => "flash", rate({ flash: 1 }))).toEqual({});
    });

    it("leaves media units alone: they run on their own models", () => {
        const rates = unitMultipliers(() => "big", rate({ big: 4 }));
        expect(rates.image).toBeUndefined();
        expect(rates.video).toBeUndefined();
    });

    it("falls back to the baseline for a model with no price", () => {
        expect(unitMultipliers(() => "unknown", rate({}))).toEqual({});
    });

    it("maps every unit to a real task or explicitly to none", () => {
        for (const [unit, task] of Object.entries(UNIT_TASK))
            expect(task === null || AI_TASKS.includes(task), `${unit} → ${task}`).toBe(true);
    });
});

describe("costOf with rates", () => {
    it("bills a pinned step at its multiple", () => {
        expect(costOf({ section: 10 })).toBe(20);
        expect(costOf({ section: 10 }, { section: 2.93 })).toBe(59);
    });

    it("charges the old price when nothing is pinned", () => {
        const usage = { plan: 1, section: 12, image: 3 };
        expect(costOf(usage, {})).toBe(costOf(usage));
    });

    it("scales only the pinned unit", () => {
        expect(costOf({ plan: 1, section: 12 }, { plan: 3 })).toBe(3 * 3 + 12 * 2);
    });

    it("still floors at 1 so nothing is free", () => {
        expect(costOf({ text: 1 }, { text: 0.14 })).toBe(1);
    });
});

describe("estimateCost with rates", () => {
    it("quotes a whole generation at the picked model's rate", () => {
        const flat = estimateCost("generate-artifact", { sections: 12 });
        const heavy = estimateCost("generate-artifact", { sections: 12 }, { plan: 3, section: 3 });
        expect(heavy).toBeGreaterThan(flat * 2.5);
    });
});
