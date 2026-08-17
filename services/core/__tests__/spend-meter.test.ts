import { describe, expect, it } from "vitest";
import type { GenerateInput, TurnRequest } from "@model/ai";
import { TOOLS } from "@model/tools";
import { ACTION_FOR, IMPLEMENTED, meterFor } from "@services/core/spend";

const input = (length?: string): GenerateInput => ({
    prompt: "p",
    surface: "deck",
    theme: "studio",
    length,
    imageSource: "ai",
});
const gen = (length?: string): TurnRequest => ({ kind: "generate", input: input(length) });

describe("what a turn bills as", () => {
    it("maps every implemented turn kind to a tool the catalog prices", () => {
        for (const kind of IMPLEMENTED) {
            expect(Object.keys(TOOLS)).toContain(ACTION_FOR[kind]);
        }
    });
});

describe("meterFor", () => {
    it("meters only generate turns", () => {
        const plan: TurnRequest = { kind: "plan", input: input("Short") };
        expect(meterFor(plan)).toEqual({});
    });

    it("carries length and image source, with no section count when no cap applies", () => {
        expect(meterFor(gen("In-depth"))).toEqual({ length: "In-depth", imageSource: "ai" });
    });

    it("clamps the metered size to the plan's section cap", () => {
        // In-depth wants 18 sections; a plan capped at 10 is billed for (and gets) 10
        expect(meterFor(gen("In-depth"), 10).sections).toBe(10);
    });

    it("leaves a brief under the cap unclamped", () => {
        expect(meterFor(gen("Short"), 10).sections).toBe(7);
    });
});
